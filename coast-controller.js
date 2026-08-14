(() => {
  const ICE_SERVERS = [{ urls: "stun:stun.cloudflare.com:3478" }];

  function init(options = {}) {
    const panel = document.getElementById("coast-panel");
    const video = options.videoElement;
    if (!panel || !video || !window.CoastClient) return null;
    const $ = (id) => document.getElementById(id);
    const createButton = $("coast-create-btn");
    const joinButton = $("coast-join-btn");
    const leaveButton = $("coast-leave-btn");
    const copyButton = $("coast-copy-btn");
    const muteButton = $("coast-mute-btn");
    const pttButton = $("coast-ptt-btn");
    const modeSelect = $("coast-mic-mode");
    const codeInput = $("coast-code-input");
    const codeNode = $("coast-room-code");
    const statusNode = $("coast-status");
    const remoteAudio = $("coast-remote-audio");
    let room = null;
    let socket = null;
    let peer = null;
    let stream = null;
    let role = "";
    let applying = false;

    function status(message, error = false) {
      statusNode.textContent = message;
      statusNode.classList.toggle("is-error", error);
    }
    function enabled() {
      return window.UiPreferences?.getPreferences?.().coastEnabled === true;
    }
    function render() {
      const active = Boolean(room);
      createButton.disabled = active;
      joinButton.disabled = active;
      leaveButton.disabled = !active;
      copyButton.disabled = !active;
      muteButton.disabled = !stream;
      pttButton.disabled = !stream || modeSelect.value !== "push";
      codeInput.disabled = active;
      codeNode.textContent = active ? `Join code: ${room.code}` : "";
      if (active) codeInput.value = room.code;
      updateMic();
    }
    function updateMic() {
      const track = stream?.getAudioTracks?.()[0];
      const open = Boolean(track?.enabled);
      muteButton.textContent = open ? "Mute Mic" : "Unmute Mic";
      pttButton.classList.toggle("is-live", open && modeSelect.value === "push");
    }
    async function activate(nextRoom) {
      const loaded = await options.ensureVideo?.(nextRoom.mediaId, 0);
      if (!loaded) throw new Error("The shared video is not available in this library.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      room = nextRoom;
      if (modeSelect.value === "push") stream.getAudioTracks()[0].enabled = false;
      connectSocket();
      render();
      status("Connecting private voice channel…");
    }
    async function create() {
      if (!enabled()) return status("Enable Coast to Coast in Settings first.", true);
      const current = options.getCurrentVideo?.();
      if (!current?.mediaId) return status("Load a shared-library video first.", true);
      try { await activate((await window.CoastClient.createRoom(current.mediaId)).room); }
      catch (error) { cleanup(false); status(error.message, true); }
    }
    async function join() {
      if (!enabled()) return status("Enable Coast to Coast in Settings first.", true);
      const code = codeInput.value.trim().toUpperCase();
      if (!code) return status("Enter a Coast join code.", true);
      try { await activate((await window.CoastClient.joinRoom(code)).room); }
      catch (error) { cleanup(false); status(error.message, true); }
    }
    function connectSocket() {
      socket = window.CoastClient.connect(room.code);
      socket.addEventListener("message", async ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "ready") {
          role = message.role;
          status(`${role === "host" ? "Host" : "Guest"} connected · ${message.participants} of 2`);
          send({ type: "voice-ready" });
        } else if (message.type === "peer-ready") {
          status(`${role === "host" ? "Host" : "Guest"} connected · 2 of 2`);
          send({ type: "voice-ready" });
        } else if (message.type === "voice-ready" && role === "host") {
          await offer();
        } else if (message.type === "offer") {
          await ensurePeer();
          await peer.setRemoteDescription(message.description);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          send({ type: "answer", description: peer.localDescription });
        } else if (message.type === "answer") {
          await peer?.setRemoteDescription(message.description);
        } else if (message.type === "ice-candidate" && message.candidate) {
          await ensurePeer();
          await peer.addIceCandidate(message.candidate).catch(() => {});
        } else if (message.type === "playback") {
          await applyPlayback(message);
        } else if (message.type === "peer-left") status("The other person left. Waiting for them to return.");
        else if (message.type === "room-ended") { cleanup(false); status("The host ended this Coast room."); }
      });
      socket.addEventListener("close", (event) => {
        if (!room) return;
        const reason = String(event.reason || "").trim();
        status(`Coast connection closed (${event.code})${reason ? `: ${reason}` : "."}`, true);
      });
    }
    async function ensurePeer() {
      if (peer) return peer;
      peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      peer.ontrack = ({ streams }) => { remoteAudio.srcObject = streams[0]; remoteAudio.play().catch(() => {}); };
      peer.onicecandidate = ({ candidate }) => candidate && send({ type: "ice-candidate", candidate });
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") status("Private voice connected · audio is not recorded.");
        if (["failed", "disconnected"].includes(peer.connectionState)) status("Voice connection interrupted.", true);
      };
      return peer;
    }
    async function offer() {
      await ensurePeer();
      const description = await peer.createOffer();
      await peer.setLocalDescription(description);
      send({ type: "offer", description: peer.localDescription });
    }
    function send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }
    async function applyPlayback(message) {
      applying = true;
      try {
        if (Number.isFinite(message.position) && Math.abs(video.currentTime - message.position) > 0.6) video.currentTime = message.position;
        if (message.action === "play") await video.play().catch(() => status("Press Play once to allow synchronized playback."));
        if (message.action === "pause") video.pause();
      } finally { setTimeout(() => { applying = false; }, 150); }
    }
    function playback(action) {
      if (!room || role !== "host" || applying) return;
      send({ type: "playback", action, position: video.currentTime || 0 });
    }
    async function leave() {
      const code = room?.code;
      cleanup(false);
      if (code) await window.CoastClient.leaveRoom(code).catch(() => {});
      status("Coast room left. Playback and microphone are independent.");
    }
    function cleanup(clearStatus = true) {
      socket?.close();
      peer?.close();
      stream?.getTracks?.().forEach((track) => track.stop());
      socket = peer = stream = room = null;
      role = "";
      remoteAudio.srcObject = null;
      render();
      if (clearStatus) status("Load a video, then create or join a private room.");
    }
    function setPush(active) {
      if (modeSelect.value !== "push" || !stream) return;
      stream.getAudioTracks()[0].enabled = active;
      updateMic();
    }
    createButton.onclick = create;
    joinButton.onclick = join;
    leaveButton.onclick = leave;
    copyButton.onclick = async () => { await navigator.clipboard.writeText(room.code); status(`Join code ${room.code} copied.`); };
    muteButton.onclick = () => { const track = stream?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; updateMic(); } };
    modeSelect.onchange = () => { if (stream) stream.getAudioTracks()[0].enabled = modeSelect.value === "open"; render(); };
    for (const event of ["pointerdown", "keydown"]) pttButton.addEventListener(event, () => setPush(true));
    for (const event of ["pointerup", "pointercancel", "pointerleave", "keyup"]) pttButton.addEventListener(event, () => setPush(false));
    video.addEventListener("play", () => playback("play"));
    video.addEventListener("pause", () => !video.ended && playback("pause"));
    video.addEventListener("seeked", () => playback("seek"));
    window.addEventListener("pagehide", () => cleanup(false));
    render();
    return { get active() { return Boolean(room); }, get canControl() { return role === "host"; } };
  }
  window.CoastController = { init };
})();
