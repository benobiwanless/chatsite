// Sign up at Agora.io to get a free App ID and temporary token
const APP_ID = "YOUR_AGORA_APP_ID"; 
const TOKEN = "YOUR_TEMP_TOKEN";
const CHANNEL = "main-room";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localTracks = [];
let remoteUsers = {};

document.getElementById('join-btn').onclick = async () => {
    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);

    // Join the channel
    const uid = await client.join(APP_ID, CHANNEL, TOKEN, null);
    
    // Create and publish local audio/video tracks
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    
    const player = document.createElement('div');
    player.id = `user-${uid}`;
    player.className = 'video-player';
    document.getElementById('video-container').appendChild(player);
    
    localTracks[1].play(player.id);
    await client.publish(localTracks);

    document.getElementById('join-btn').disabled = true;
    document.getElementById('leave-btn').disabled = false;
};

async function handleUserPublished(user, mediaType) {
    remoteUsers[user.uid] = user;
    await client.subscribe(user, mediaType);

    if (mediaType === 'video') {
        let player = document.getElementById(`user-${user.uid}`);
        if (player) player.remove();

        player = document.createElement('div');
        player.id = `user-${user.uid}`;
        player.className = 'video-player';
        document.getElementById('video-container').appendChild(player);
        user.videoTrack.play(player.id);
    }
    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}

async function handleUserUnpublished(user) {
    delete remoteUsers[user.uid];
    const player = document.getElementById(`user-${user.uid}`);
    if (player) player.remove();
}

document.getElementById('leave-btn').onclick = async () => {
    for (let track of localTracks) {
        track.stop();
        track.close();
    }
    await client.leave();
    document.getElementById('video-container').innerHTML = '';
    document.getElementById('join-btn').disabled = false;
    document.getElementById('leave-btn').disabled = true;
};
