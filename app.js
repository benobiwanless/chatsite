import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    onSnapshot,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


/* --------------------------------------------------
   FIREBASE
-------------------------------------------------- */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


/* --------------------------------------------------
   WEBRTC
-------------------------------------------------- */

let localStream = null;

let remoteStream = null;

let peerConnection = null;

let roomId = null;

let roomRef = null;

let callerCandidatesUnsubscribe = null;

let calleeCandidatesUnsubscribe = null;

let remoteDescriptionSet = false;


/*
 * Google's public STUN servers.
 *
 * STUN allows the browsers to discover their
 * public network address.
 */

const rtcConfiguration = {

    iceServers: [

        {
            urls: "stun:stun.l.google.com:19302"
        },

        {
            urls: "stun:stun1.l.google.com:19302"
        }

    ]

};


/* --------------------------------------------------
   DOM
-------------------------------------------------- */

const localVideo =
    document.getElementById("localVideo");

const remoteVideo =
    document.getElementById("remoteVideo");

const remotePlaceholder =
    document.getElementById("remotePlaceholder");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const roomInput =
    document.getElementById("roomInput");

const copyRoomButton =
    document.getElementById("copyRoomButton");

const hangupButton =
    document.getElementById("hangupButton");

const micButton =
    document.getElementById("micButton");

const cameraButton =
    document.getElementById("cameraButton");

const welcomePanel =
    document.getElementById("welcomePanel");

const welcomeError =
    document.getElementById("welcomeError");

const roomLabel =
    document.getElementById("roomLabel");

const connectionStatus =
    document.getElementById("connectionStatus");

const toast =
    document.getElementById("toast");


/* --------------------------------------------------
   UTILITY
-------------------------------------------------- */

function showToast(message) {

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);
}


function showError(message) {

    welcomeError.textContent = message;

}


function clearError() {

    welcomeError.textContent = "";

}


function generateRoomId() {

    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

}


function updateStatus(text) {

    connectionStatus.textContent = text;

}


/* --------------------------------------------------
   CAMERA / MICROPHONE
-------------------------------------------------- */

async function startLocalMedia() {

    if (localStream) {

        return localStream;

    }

    try {

        localStream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    }
                },

                audio: true

            });

        localVideo.srcObject = localStream;

        return localStream;

    } catch (error) {

        console.error(error);

        throw new Error(
            "Camera or microphone permission was denied."
        );

    }

}


/* --------------------------------------------------
   CREATE PEER CONNECTION
-------------------------------------------------- */

function createPeerConnection() {

    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    remoteStream =
        new MediaStream();

    remoteVideo.srcObject =
        remoteStream;


    /*
     * Add local tracks.
     */

    localStream
        .getTracks()
        .forEach(track => {

            peerConnection.addTrack(
                track,
                localStream
            );

        });


    /*
     * Receive remote tracks.
     */

    peerConnection.ontrack = event => {

        event.streams[0]
            .getTracks()
            .forEach(track => {

                remoteStream.addTrack(track);

            });

        remotePlaceholder
            .classList.add("hidden");

    };


    /*
     * ICE candidates.
     */

    peerConnection.onicecandidate =
        async event => {

            if (!event.candidate) {
                return;
            }

            if (!roomRef) {
                return;
            }


            const candidatesCollection =
                collection(
                    roomRef,
                    "candidates"
                );


            await addDoc(
                candidatesCollection,
                {
                    candidate:
                        event.candidate.toJSON(),

                    sender:
                        auth.currentUser.uid
                }
            );

        };


    /*
     * Connection state.
     */

    peerConnection.onconnectionstatechange =
        () => {

            console.log(
                "Connection:",
                peerConnection.connectionState
            );


            if (
                peerConnection.connectionState ===
                "connected"
            ) {

                updateStatus("Connected");

            }


            if (
                peerConnection.connectionState ===
                "disconnected"
            ) {

                updateStatus("Disconnected");

            }


            if (
                peerConnection.connectionState ===
                "failed"
            ) {

                updateStatus("Connection failed");

            }

        };


    return peerConnection;

}


/* --------------------------------------------------
   CREATE ROOM
-------------------------------------------------- */

async function createRoom() {

    clearError();

    try {

        await startLocalMedia();


        roomId =
            generateRoomId();


        roomRef =
            doc(
                db,
                "rooms",
                roomId
            );


        createPeerConnection();


        /*
         * Create an empty room.
         */

        await setDoc(
            roomRef,
            {
                createdAt:
                    new Date().toISOString(),

                createdBy:
                    auth.currentUser.uid,

                status:
                    "waiting"
            }
        );


        /*
         * Create WebRTC offer.
         */

        const offer =
            await peerConnection
                .createOffer();


        await peerConnection
            .setLocalDescription(offer);


        await updateDoc(
            roomRef,
            {
                offer: {
                    type: offer.type,

                    sdp: offer.sdp
                }
            }
        );


        /*
         * Listen for the answer.
         */

        onSnapshot(
            roomRef,
            async snapshot => {

                const data =
                    snapshot.data();


                if (!data) {
                    return;
                }


                if (
                    data.answer &&
                    !remoteDescriptionSet
                ) {

                    await peerConnection
                        .setRemoteDescription(
                            new RTCSessionDescription(
                                data.answer
                            )
                        );

                    remoteDescriptionSet =
                        true;

                    updateStatus(
                        "Connecting..."
                    );

                }

            }
        );


        /*
         * Listen for incoming ICE candidates.
         */

        listenForCandidates(
            roomRef,
            auth.currentUser.uid
        );


        showRoom();

        showToast(
            "Room created. Send the link!"
        );


    } catch (error) {

        console.error(error);

        showError(
            error.message ||
            "Unable to create room."
        );

    }

}


/* --------------------------------------------------
   JOIN ROOM
-------------------------------------------------- */

async function joinRoom() {

    clearError();


    const enteredRoom =
        roomInput.value
            .trim()
            .toUpperCase();


    if (!enteredRoom) {

        showError(
            "Enter a room code."
        );

        return;

    }


    try {

        await startLocalMedia();


        roomId =
            enteredRoom;


        roomRef =
            doc(
                db,
                "rooms",
                roomId
            );


        const roomSnapshot =
            await getDoc(roomRef);


        if (!roomSnapshot.exists()) {

            throw new Error(
                "That room does not exist."
            );

        }


        const roomData =
            roomSnapshot.data();


        if (!roomData.offer) {

            throw new Error(
                "This room is not ready yet."
            );

        }


        createPeerConnection();


        /*
         * Set the caller's offer.
         */

        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    roomData.offer
                )
            );


        remoteDescriptionSet =
            true;


        /*
         * Create answer.
         */

        const answer =
            await peerConnection
                .createAnswer();


        await peerConnection
            .setLocalDescription(answer);


        await updateDoc(
            roomRef,
            {
                answer: {
                    type: answer.type,

                    sdp: answer.sdp
                },

                status:
                    "connected"
            }
        );


        listenForCandidates(
            roomRef,
            auth.currentUser.uid
        );


        showRoom();


        updateStatus(
            "Connecting..."
        );


    } catch (error) {

        console.error(error);

        showError(
            error.message ||
            "Unable to join room."
        );

    }

}


/* --------------------------------------------------
   ICE CANDIDATES
-------------------------------------------------- */

function listenForCandidates(
    room,
    currentUserId
) {

    const candidates =
        collection(
            room,
            "candidates"
        );


    const unsubscribe =
        onSnapshot(
            candidates,
            snapshot => {

                snapshot.docChanges()
                    .forEach(async change => {

                        if (
                            change.type !==
                            "added"
                        ) {

                            return;

                        }


                        const data =
                            change.doc.data();


                        /*
                         * Ignore our own candidates.
                         */

                        if (
                            data.sender ===
                            currentUserId
                        ) {

                            return;

                        }


                        if (
                            peerConnection &&
                            remoteDescriptionSet
                        ) {

                            try {

                                await peerConnection
                                    .addIceCandidate(
                                        new RTCIceCandidate(
                                            data.candidate
                                        )
                                    );

                            } catch (error) {

                                console.error(
                                    "ICE error:",
                                    error
                                );

                            }

                        }

                    });

            }
        );


    return unsubscribe;

}


/* --------------------------------------------------
   SHOW ROOM
-------------------------------------------------- */

function showRoom() {

    welcomePanel
        .classList.add("hidden");


    roomLabel.textContent =
        `Room: ${roomId}`;


    updateStatus(
        "Waiting for connection..."
    );

}


/* --------------------------------------------------
   COPY LINK
-------------------------------------------------- */

copyRoomButton
    .addEventListener(
        "click",
        async () => {

            if (!roomId) {

                return;

            }


            const url =
                `${window.location.origin}${window.location.pathname}?room=${roomId}`;


            try {

                await navigator.clipboard
                    .writeText(url);

                showToast(
                    "Room link copied!"
                );

            } catch {

                showToast(
                    "Copy failed."
                );

            }

        }
    );


/* --------------------------------------------------
   MICROPHONE
-------------------------------------------------- */

micButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }


            const audioTracks =
                localStream.getAudioTracks();


            audioTracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });


            const enabled =
                audioTracks[0]?.enabled;


            micButton.textContent =
                enabled ? "🎤" : "🔇";

        }
    );


/* --------------------------------------------------
   CAMERA
-------------------------------------------------- */

cameraButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }


            const videoTracks =
                localStream.getVideoTracks();


            videoTracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });


            const enabled =
                videoTracks[0]?.enabled;


            cameraButton.textContent =
                enabled ? "📹" : "🚫";

        }
    );


/* --------------------------------------------------
   HANG UP
-------------------------------------------------- */

hangupButton
    .addEventListener(
        "click",
        async () => {

            await leaveRoom();

        }
    );


async function leaveRoom() {

    if (peerConnection) {

        peerConnection.close();

        peerConnection = null;

    }


    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                track.stop();

            });

        localStream = null;

    }


    if (remoteStream) {

        remoteStream
            .getTracks()
            .forEach(track => {

                track.stop();

            });

        remoteStream = null;

    }


    /*
     * Remove room.
     */

    if (roomRef) {

        try {

            await deleteDoc(roomRef);

        } catch (error) {

            console.log(
                "Room cleanup:",
                error
            );

        }

    }


    roomId = null;

    roomRef = null;

    remoteVideo.srcObject = null;

    localVideo.srcObject = null;


    remotePlaceholder
        .classList.remove("hidden");


    welcomePanel
        .classList.remove("hidden");


    roomLabel.textContent =
        "No room";


    updateStatus(
        "Not connected"
    );

}


/* --------------------------------------------------
   BUTTON EVENTS
-------------------------------------------------- */

createRoomButton
    .addEventListener(
        "click",
        createRoom
    );


joinRoomButton
    .addEventListener(
        "click",
        joinRoom
    );


roomInput
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                joinRoom();

            }

        }
    );


/* --------------------------------------------------
   AUTO JOIN FROM URL
-------------------------------------------------- */

function getRoomFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return params.get("room");

}


/* --------------------------------------------------
   FIREBASE AUTH
-------------------------------------------------- */

onAuthStateChanged(
    auth,
    async user => {

        if (user) {

            console.log(
                "Authenticated:",
                user.uid
            );


            const urlRoom =
                getRoomFromUrl();


            if (urlRoom) {

                roomInput.value =
                    urlRoom
                        .toUpperCase();

            }

            return;

        }


        try {

            await signInAnonymously(
                auth
            );

        } catch (error) {

            console.error(error);

            showError(
                "Unable to connect to Firebase."
            );

        }

    }
);