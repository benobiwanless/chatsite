import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


/* ================================
   FIREBASE
================================ */

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);


/* ================================
   STATE
================================ */

let currentUser = null;
let authReady = false;

let localStream = null;
let remoteStream = null;
let peerConnection = null;

let roomId = null;
let roomRef = null;

let remoteDescriptionSet = false;


/* ================================
   WEBRTC
================================ */

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


/* ================================
   DOM
================================ */

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


/* ================================
   STATUS
================================ */

function setStatus(message) {

    connectionStatus.textContent = message;

}


function showError(message) {

    console.error(message);

    welcomeError.textContent = message;

}


function clearError() {

    welcomeError.textContent = "";

}


function showToast(message) {

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);

}


/* ================================
   AUTHENTICATION
================================ */

const authReadyPromise = new Promise(
    (resolve, reject) => {

        const unsubscribe =
            onAuthStateChanged(
                auth,
                async user => {

                    if (user) {

                        currentUser = user;

                        authReady = true;

                        console.log(
                            "Firebase authenticated:",
                            user.uid
                        );

                        setStatus(
                            "Ready"
                        );

                        unsubscribe();

                        resolve(user);

                        return;

                    }


                    try {

                        console.log(
                            "Signing in anonymously..."
                        );

                        await signInAnonymously(
                            auth
                        );

                    } catch (error) {

                        console.error(
                            "Anonymous authentication failed:",
                            error
                        );

                        showError(
                            "Firebase authentication failed. " +
                            error.message
                        );

                        reject(error);

                    }

                }
            );

    }
);


/* ================================
   GENERATE ROOM
================================ */

function generateRoomId() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (let i = 0; i < 6; i++) {

        result +=
            chars.charAt(
                Math.floor(
                    Math.random() *
                    chars.length
                )
            );

    }

    return result;

}


/* ================================
   CAMERA
================================ */

async function startLocalMedia() {

    if (localStream) {

        return localStream;

    }


    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        throw new Error(
            "Your browser does not allow camera access. Make sure you are using the HTTPS GitHub Pages address."
        );

    }


    try {

        localStream =
            await navigator.mediaDevices
                .getUserMedia({

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


        localVideo.srcObject =
            localStream;


        console.log(
            "Camera and microphone started"
        );


        return localStream;


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            throw new Error(
                "Camera/microphone permission was denied. Please allow access and try again."
            );

        }


        if (
            error.name ===
            "NotFoundError"
        ) {

            throw new Error(
                "No camera or microphone was found."
            );

        }


        throw new Error(
            "Unable to access your camera or microphone: " +
            error.message
        );

    }

}


/* ================================
   PEER CONNECTION
================================ */

function createPeerConnection() {

    console.log(
        "Creating WebRTC connection..."
    );


    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    remoteStream =
        new MediaStream();


    remoteVideo.srcObject =
        remoteStream;


    /*
     * Local tracks
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
     * Remote tracks
     */

    peerConnection.ontrack =
        event => {

            console.log(
                "Received remote track"
            );


            event.streams[0]
                .getTracks()
                .forEach(track => {

                    remoteStream.addTrack(
                        track
                    );

                });


            remotePlaceholder
                .classList.add(
                    "hidden"
                );

        };


    /*
     * ICE candidates
     */

    peerConnection.onicecandidate =
        async event => {

            if (
                !event.candidate ||
                !roomRef ||
                !currentUser
            ) {

                return;

            }


            try {

                await addDoc(

                    collection(
                        roomRef,
                        "candidates"
                    ),

                    {
                        candidate:
                            event.candidate.toJSON(),

                        sender:
                            currentUser.uid,

                        createdAt:
                            Date.now()
                    }

                );

            } catch (error) {

                console.error(
                    "ICE candidate error:",
                    error
                );

            }

        };


    /*
     * Connection status
     */

    peerConnection
        .onconnectionstatechange =
        () => {

            const state =
                peerConnection
                    .connectionState;


            console.log(
                "WebRTC state:",
                state
            );


            if (
                state ===
                "connected"
            ) {

                setStatus(
                    "Connected"
                );

            }


            if (
                state ===
                "connecting"
            ) {

                setStatus(
                    "Connecting..."
                );

            }


            if (
                state ===
                "disconnected"
            ) {

                setStatus(
                    "Disconnected"
                );

            }


            if (
                state ===
                "failed"
            ) {

                setStatus(
                    "Connection failed"
                );

            }

        };


    return peerConnection;

}


/* ================================
   LISTEN FOR ICE
================================ */

function listenForCandidates() {

    if (
        !roomRef ||
        !currentUser
    ) {

        return;

    }


    const candidates =
        collection(
            roomRef,
            "candidates"
        );


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
                     * Ignore our own ICE.
                     */

                    if (
                        data.sender ===
                        currentUser.uid
                    ) {

                        return;

                    }


                    if (
                        !peerConnection ||
                        !remoteDescriptionSet
                    ) {

                        return;

                    }


                    try {

                        await peerConnection
                            .addIceCandidate(

                                new RTCIceCandidate(
                                    data.candidate
                                )

                            );

                    } catch (error) {

                        console.error(
                            "Unable to add ICE candidate:",
                            error
                        );

                    }

                });

        }
    );

}


/* ================================
   CREATE ROOM
================================ */

async function createRoom() {

    clearError();


    try {

        /*
         * IMPORTANT:
         * Wait for Firebase authentication.
         */

        await authReadyPromise;


        if (!currentUser) {

            throw new Error(
                "Firebase authentication is not ready."
            );

        }


        console.log(
            "Creating room..."
        );


        /*
         * Request camera.
         */

        await startLocalMedia();


        /*
         * Generate room ID.
         */

        roomId =
            generateRoomId();


        console.log(
            "Room ID:",
            roomId
        );


        /*
         * Firebase room reference.
         */

        roomRef =
            doc(
                db,
                "rooms",
                roomId
            );


        /*
         * Create WebRTC.
         */

        createPeerConnection();


        /*
         * Create room.
         */

        await setDoc(
            roomRef,
            {

                createdAt:
                    Date.now(),

                createdBy:
                    currentUser.uid,

                status:
                    "waiting"

            }
        );


        console.log(
            "Firestore room created"
        );


        /*
         * Create offer.
         */

        const offer =
            await peerConnection
                .createOffer();


        await peerConnection
            .setLocalDescription(
                offer
            );


        console.log(
            "WebRTC offer created"
        );


        /*
         * Save offer.
         */

        await updateDoc(
            roomRef,
            {

                offer: {

                    type:
                        offer.type,

                    sdp:
                        offer.sdp

                }

            }
        );


        console.log(
            "Offer saved to Firebase"
        );


        /*
         * Watch room for answer.
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

                    console.log(
                        "Received answer"
                    );


                    await peerConnection
                        .setRemoteDescription(

                            new RTCSessionDescription(
                                data.answer
                            )

                        );


                    remoteDescriptionSet =
                        true;


                    setStatus(
                        "Connecting..."
                    );

                }

            }
        );


        /*
         * Watch ICE.
         */

        listenForCandidates();


        /*
         * Show room.
         */

        welcomePanel
            .classList.add(
                "hidden"
            );


        roomLabel.textContent =
            `Room: ${roomId}`;


        setStatus(
            "Waiting for someone..."
        );


        showToast(
            "Room created!"
        );


        /*
         * Put room into URL.
         */

        const newUrl =
            `${window.location.pathname}?room=${roomId}`;


        window.history
            .replaceState(
                {},
                "",
                newUrl
            );


        console.log(
            "ROOM READY:",
            roomId
        );


    } catch (error) {

        console.error(
            "CREATE ROOM FAILED:",
            error
        );


        /*
         * Clean up if creation failed.
         */

        if (peerConnection) {

            peerConnection.close();

            peerConnection = null;

        }


        showError(
            error.message ||
            "Unable to create room."
        );

    }

}


/* ================================
   JOIN ROOM
================================ */

async function joinRoom() {

    clearError();


    try {

        await authReadyPromise;


        if (!currentUser) {

            throw new Error(
                "Firebase authentication is not ready."
            );

        }


        const enteredRoom =
            roomInput.value
                .trim()
                .toUpperCase();


        if (!enteredRoom) {

            throw new Error(
                "Please enter a room code."
            );

        }


        await startLocalMedia();


        roomId =
            enteredRoom;


        roomRef =
            doc(
                db,
                "rooms",
                roomId
            );


        const snapshot =
            await getDoc(
                roomRef
            );


        if (!snapshot.exists()) {

            throw new Error(
                "That room does not exist."
            );

        }


        const roomData =
            snapshot.data();


        if (!roomData.offer) {

            throw new Error(
                "That room is not ready yet."
            );

        }


        createPeerConnection();


        /*
         * Apply offer.
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
            .setLocalDescription(
                answer
            );


        /*
         * Save answer.
         */

        await updateDoc(
            roomRef,
            {

                answer: {

                    type:
                        answer.type,

                    sdp:
                        answer.sdp

                },

                status:
                    "connected"

            }
        );


        listenForCandidates();


        welcomePanel
            .classList.add(
                "hidden"
            );


        roomLabel.textContent =
            `Room: ${roomId}`;


        setStatus(
            "Connecting..."
        );


        showToast(
            "Joined room!"
        );


    } catch (error) {

        console.error(
            "JOIN ROOM FAILED:",
            error
        );


        showError(
            error.message ||
            "Unable to join room."
        );

    }

}


/* ================================
   COPY LINK
================================ */

copyRoomButton
    .addEventListener(
        "click",
        async () => {

            if (!roomId) {

                return;

            }


            const link =
                `${window.location.origin}${window.location.pathname}?room=${roomId}`;


            try {

                await navigator.clipboard
                    .writeText(link);


                showToast(
                    "Room link copied!"
                );


            } catch {

                showToast(
                    "Unable to copy link."
                );

            }

        }
    );


/* ================================
   MICROPHONE
================================ */

micButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) {

                return;

            }


            const tracks =
                localStream
                    .getAudioTracks();


            tracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });


            const enabled =
                tracks[0]?.enabled;


            micButton.textContent =
                enabled
                    ? "🎤"
                    : "🔇";

        }
    );


/* ================================
   CAMERA
================================ */

cameraButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) {

                return;

            }


            const tracks =
                localStream
                    .getVideoTracks();


            tracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });


            const enabled =
                tracks[0]?.enabled;


            cameraButton.textContent =
                enabled
                    ? "📹"
                    : "🚫";

        }
    );


/* ================================
   HANG UP
================================ */

hangupButton
    .addEventListener(
        "click",
        async () => {

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


            if (roomRef) {

                try {

                    await deleteDoc(
                        roomRef
                    );

                } catch (error) {

                    console.log(
                        "Room cleanup:",
                        error
                    );

                }

            }


            localVideo.srcObject =
                null;

            remoteVideo.srcObject =
                null;


            remotePlaceholder
                .classList
                .remove("hidden");


            roomId =
                null;

            roomRef =
                null;

            remoteDescriptionSet =
                false;


            roomLabel.textContent =
                "No room";


            setStatus(
                "Ready"
            );


            welcomePanel
                .classList
                .remove("hidden");


            window.history
                .replaceState(
                    {},
                    "",
                    window.location.pathname
                );

        }
    );


/* ================================
   BUTTONS
================================ */

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


/* ================================
   AUTO JOIN
================================ */

function getRoomFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return params.get(
        "room"
    );

}


getRoomFromUrl();


/* ================================
   STARTUP
================================ */

authReadyPromise
    .then(() => {

        const urlRoom =
            getRoomFromUrl();


        if (urlRoom) {

            roomInput.value =
                urlRoom.toUpperCase();

        }


        console.log(
            "VIDEO CHAT READY"
        );

    })
    .catch(error => {

        console.error(
            "Startup failed:",
            error
        );

    });
