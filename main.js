// Simple Agora WebRTC Static Integration
let client = null;
let localTracks = [];
let remoteUsers = {};

const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const videoGrid = document.getElementById('video-grid');

joinBtn.onclick = async () => {
    const appId = document.getElementById('app-id').value.trim();
    const token = document.getElementById('token').value.trim() || null;
    const channel = document.getElementById('channel').value.trim();

    if (!appId) {
        alert('Please enter your Agora App ID to connect.');
        return;
    }

    try {
        // Initialize client
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        // Setup event listeners for remote users matching network streams
        client.on('user-published', handleUserPublished);
        client.on('user-unpublished', handleUserUnpublished);

        // Join the channel 
        // Passing null for UID lets Agora assign a random unique numerical ID
        const uid = await client.join(appId, channel, token, null);
        
        // Request browser camera and microphone permissions to build local tracks
        localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        
        // Render local user preview box
        createVideoContainer(`user-${uid}`, 'Your Video (Local)');
        
        // Play local camera preview track inside the container element
        localTracks[1].play(`user-${uid}`);
        
        // Publish local stream data out to the network channel
        await client.publish(localTracks);

        // Toggle UI states
        joinBtn.disabled = true;
        leaveBtn.disabled = false;
        
    } catch (error) {
        console.error("Failed to join video room:", error);
        alert(`Connection Error: ${error.message}. Double-check your App ID and Token credentials.`);
    }
};

async function handleUserPublished(user, mediaType) {
    const id = user.uid;
    remoteUsers[id] = user;
    
    // Subscribe to incoming stream traffic from remote peer
    await client.subscribe(user, mediaType);

    if (mediaType === 'video') {
        // Clear conflicting previous container elements if present
        const existingPlayer = document.getElementById(`user-${id}`);
        if (existingPlayer) existingPlayer.parentElement.remove();

        // Construct video frame container
        createVideoContainer(`user-${id}`, `Peer User (${id})`);
        // Attach track element playback
        user.videoTrack.play(`user-${id}`);
    }

    if (mediaType === 'audio') {
        // Directly pipe track element audio stream to hardware output speakers
        user.audioTrack.play();
    }
}

async function handleUserUnpublished(user) {
    const id = user.uid;
    delete remoteUsers[id];
    
    const element = document.getElementById(`user-${id}`);
    if (element) {
        // Remove entire wrapping structure container frame
        element.parentElement.remove();
    }
}

document.getElementById('leave-btn').onclick = async () => {
    // Gracefully terminate hardware camera/mic processes
    for (let track of localTracks) {
        track.stop();
        track.close();
    }
    localTracks = [];

    // Leave network channel session
    if (client) {
        await client.leave();
    }
    
    // Clean stream view layout elements
    videoGrid.innerHTML = '';
    
    // Reset control buttons UI toggle states
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
};

// Utility function to cleanly wrap layout video playback containers
function createVideoContainer(playerId, labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';

    const playerDiv = document.createElement('div');
    playerDiv.id = playerId;
    playerDiv.className = 'video-player';

    const label = document.createElement('div');
    label.className = 'user-label';
    label.innerText = labelText;

    wrapper.appendChild(playerDiv);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);
}
