import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, formatDate, formatSlot, tokenStore } from '../api.js';
import { useAuth } from '../auth.jsx';

/*
 * WebRTC flow
 * 1. Both sides open the camera and join a Socket.IO room tied to the booking.
 * 2. Whoever was already waiting receives "peer-joined" and creates the SDP offer.
 * 3. The newcomer answers. Both trickle ICE candidates through the server.
 * 4. Once ICE finds a path, audio/video flows directly between the browsers.
 */

const STATUS_TEXT = {
  starting: 'Starting camera…',
  waiting: 'Waiting for the other person to join',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Connection unstable, reconnecting…',
  error: 'Could not join',
};

async function getMedia() {
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }), note: '' };
  } catch {
    try {
      return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }), note: 'Camera unavailable, joined with audio only.' };
    } catch {
      return { stream: null, note: 'Camera and microphone are blocked. Allow them in your browser to be seen and heard.' };
    }
  }
}

export default function Consult() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const pendingIce = useRef([]);
  const chatEnd = useRef(null);

  const [booking, setBooking] = useState(null);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [peerName, setPeerName] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    let iceServers = [];

    function closePeer() {
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      pendingIce.current = [];
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
      setHasRemoteVideo(false);
    }

    function createPeer() {
      closePeer();
      const pc = new RTCPeerConnection({ iceServers });
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // Still receive the other side's media even if we have no camera/mic.
      if (!stream?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
      if (!stream?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (e) => {
        const [remote] = e.streams;
        if (remoteVideo.current && remote) remoteVideo.current.srcObject = remote;
        if (e.track.kind === 'video') setHasRemoteVideo(true);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) socketRef.current?.emit('signal', { type: 'candidate', candidate: e.candidate });
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') { setStatus('connected'); setStartedAt((t) => t || Date.now()); }
        else if (s === 'disconnected') setStatus('reconnecting');
        else if (s === 'failed') { setStatus('reconnecting'); pc.restartIce?.(); }
      };
      pcRef.current = pc;
      return pc;
    }

    async function flushIce() {
      const pc = pcRef.current;
      while (pc && pendingIce.current.length) {
        await pc.addIceCandidate(pendingIce.current.shift()).catch(() => {});
      }
    }

    async function start() {
      try {
        const [b, ice] = await Promise.all([api(`/bookings/${bookingId}`), api('/config/ice')]);
        if (cancelled) return;
        setBooking(b);
        iceServers = ice.iceServers;
      } catch (e) {
        setError(e.message); setStatus('error');
        return;
      }

      const { stream, note: mediaNote } = await getMedia();
      if (cancelled) { stream?.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      setNote(mediaNote);
      setCamOn(!!stream?.getVideoTracks().length);
      setMicOn(!!stream?.getAudioTracks().length);
      if (localVideo.current && stream) localVideo.current.srcObject = stream;

      const socket = io({ auth: { token: tokenStore.get() }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;

      socket.on('connect_error', () => { setError('Could not reach the call server. Check your connection.'); setStatus('error'); });
      socket.on('connect', () => {
        setError('');
        socket.emit('join-room', { bookingId }, (res) => {
          if (res?.error) { setError(res.error); setStatus('error'); return; }
          if (res.peerPresent) { setPeerName(res.peerName); setStatus('connecting'); } // they will send the offer
          else setStatus('waiting');
        });
      });

      // We were here first, so we start the call.
      socket.on('peer-joined', async ({ name }) => {
        setPeerName(name);
        setStatus('connecting');
        const pc = createPeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { type: 'offer', sdp: pc.localDescription });
      });

      socket.on('signal', async (msg) => {
        try {
          if (msg.type === 'offer') {
            const pc = createPeer();
            await pc.setRemoteDescription(msg.sdp);
            await flushIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { type: 'answer', sdp: pc.localDescription });
          } else if (msg.type === 'answer' && pcRef.current) {
            await pcRef.current.setRemoteDescription(msg.sdp);
            await flushIce();
          } else if (msg.type === 'candidate') {
            // Candidates can arrive before the remote description; queue them until it's set.
            if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(msg.candidate).catch(() => {});
            else pendingIce.current.push(msg.candidate);
          }
        } catch (e) {
          console.error('Signaling error', e);
        }
      });

      socket.on('peer-left', () => {
        closePeer();
        setStatus('waiting');
      });

      socket.on('chat', (m) => {
        setMessages((prev) => [...prev, m]);
        if (m.fromId !== user.id) setUnread((n) => n + 1);
      });
    }

    start();
    return () => {
      cancelled = true;
      socketRef.current?.emit('leave-room');
      socketRef.current?.disconnect();
      closePeer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [bookingId, user.id]);

  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => { if (chatOpen) setUnread(0); chatEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, chatOpen]);

  const toggle = (kind) => {
    const tracks = kind === 'audio' ? streamRef.current?.getAudioTracks() : streamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    (kind === 'audio' ? setMicOn : setCamOn)(next);
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (draft.trim()) socketRef.current?.emit('chat', draft.trim());
    setDraft('');
  };

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const otherName = peerName || (booking && (user.role === 'PROVIDER' ? booking.patient.name : booking.provider.name));

  if (status === 'error') {
    return (
      <div className="call call-error">
        <h1>Can't join this consultation</h1>
        <p>{error}</p>
        <Link className="btn btn-primary" to="/appointments">Back to appointments</Link>
      </div>
    );
  }

  return (
    <div className="call">
      <header className="call-bar">
        <div>
          <strong>{otherName || 'Consultation'}</strong>
          {booking && <span className="call-meta">{formatDate(booking.date)}, {formatSlot(booking.timeSlot)}</span>}
        </div>
        <div className={`call-status s-${status}`} role="status">
          <span className="dot" aria-hidden="true" />
          {status === 'connected' ? `Connected ${clock}` : STATUS_TEXT[status]}
        </div>
      </header>

      <div className={`call-stage ${chatOpen ? 'with-chat' : ''}`}>
        <div className="remote">
          <video ref={remoteVideo} autoPlay playsInline aria-label={`${otherName || 'Remote'} video`} />
          {!hasRemoteVideo && (
            <div className="remote-placeholder">
              {status === 'waiting' ? (
                <>
                  <p className="big">{otherName ? `${otherName} hasn't joined yet` : 'Waiting for the other person'}</p>
                  <p>Keep this page open. The call starts automatically when they join.</p>
                </>
              ) : status === 'connected' ? <p className="big">{otherName}'s camera is off</p> : <p className="big">{STATUS_TEXT[status]}</p>}
            </div>
          )}
          <video ref={localVideo} className={`local ${camOn ? '' : 'off'}`} autoPlay playsInline muted aria-label="Your video" />
        </div>

        {chatOpen && (
          <aside className="chat" aria-label="Chat">
            <ul>
              {messages.length === 0 && <li className="muted">Messages are only visible during this call.</li>}
              {messages.map((m) => (
                <li key={`${m.at}-${m.fromId}`} className={m.fromId === user.id ? 'me' : ''}>
                  <span className="who">{m.fromId === user.id ? 'You' : m.from}</span>
                  <span>{m.text}</span>
                </li>
              ))}
              <li ref={chatEnd} aria-hidden="true" />
            </ul>
            <form onSubmit={sendChat}>
              <label htmlFor="chat-input" className="sr-only">Message</label>
              <input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message" autoComplete="off" />
              <button className="btn btn-primary">Send</button>
            </form>
          </aside>
        )}
      </div>

      {note && <p className="call-note" role="status">{note}</p>}

      <footer className="controls">
        <button type="button" className={`ctl ${micOn ? '' : 'off'}`} onClick={() => toggle('audio')} aria-pressed={!micOn}>{micOn ? 'Mute' : 'Unmute'}</button>
        <button type="button" className={`ctl ${camOn ? '' : 'off'}`} onClick={() => toggle('video')} aria-pressed={!camOn}>{camOn ? 'Stop video' : 'Start video'}</button>
        <button type="button" className="ctl" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen}>
          Chat{unread > 0 && !chatOpen ? ` (${unread})` : ''}
        </button>
        <button type="button" className="ctl end" onClick={() => navigate('/appointments')}>Leave call</button>
      </footer>
    </div>
  );
}
