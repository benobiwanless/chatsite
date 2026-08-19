import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

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
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

console.log("APP.JS STARTED");


/* =========================
   FIREBASE
========================= */

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

let currentUser = null;

let localStream = null;

let peerConnection = null;

let roomId = null;

let roomRef = null;

let remoteDescriptionSet = false;


/* =========================
   DOM
========================= */

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const roomInput =
    document.getElementById("roomInput");

const welcomePanel =
    document.getElementById("welcomePanel");

const welcomeError =
    document.getElementById("welcomeError");

const localVideo =
    document.getElementById("localVideo");

const remoteVideo =
    document.getElementById("remoteVideo");

const remotePlaceholder =
    document.getElementById("remotePlaceholder");

const roomLabel =
    document.getElementById("roomLabel");

const connectionStatus =
    document.getElementById("connectionStatus");

const copyRoomButton =
    document.getElementById("copyRoomButton");

const micButton =
    document.getElementById("micButton");

const cameraButton =
    document.getElementById("cameraButton");

const hangupButton =
    document.getElementById("hangupButton");

const toast =
    document.getElementById("toast");


/* =========================
   HELPERS
========================= */

function error(message) {

    console.error(message);

    if (welcomeError) {
        welcomeError.textContent = message;
    }

}


function status(message) {

    if (connectionStatus) {
        connectionStatus.textContent = message;
    }

}


function toastMessage(message) {

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);

}


function generateRoomId() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (let i = 0; i < 6; i++) {

        result += characters[
            Math.floor(
                Math.random() *
                characters.length
            )
        ];

    }

    return result;

}


/* =========================
   FIREBASE AUTH
========================= */

const authReady = new Promise(
    (resolve, reject) => {

        const unsubscribe =
            onAuthStateChanged(
                auth,
                async user => {

                    if (user) {

                        currentUser = user;

                        console.log(
                            "Firebase user:",
                            user.uid
                        );

                        status("Ready");

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

                    } catch (err) {

                        console.error(err);

                        error(
                            "Firebase Anonymous Authentication is not enabled. " +
                            err.message
                        );

                        reject(err);

                    }

                }
            );

    }
);


/* =========================
   CAMERA
========================= */

async function startCamera() {

    if (localStream) {
        return;
    }

    console.log(
        "Requesting camera and microphone..."
    );

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        throw new Error(
            "Camera access is unavailable. Make sure you are using the HTTPS GitHub Pages address."
        );

    }

    try {

        localStream =
            await navigator.mediaDevices
                .getUserMedia({

                    video: true,

                    audio: true

                });

        localVideo.srcObject =
            localStream;

        console.log(
            "Camera and microphone permission granted."
        );

    } catch (err) {

        console.error(err);

        if (
            err.name ===
            "NotAllowedError"
        ) {

            throw new Error(
                "Camera/microphone permission was denied. Allow access in your browser and try again."
            );

        }

        if (
            err.name ===
            "NotFoundError"
        ) {

            throw new Error(
                "No camera or microphone was found."
            );

        }

        throw new Error(
            "Could not access camera/microphone: " +
            err.message
        );

    }

}


/* =========================
   WEBRTC
========================= */

function createPeerConnection() {

    peerConnection =
        new RTCPeerConnection({

            iceServers: [

                {
                    urls:
                        "stun:stun.l.google.com:19302"
                },

                {
                    urls:
                        "stun:stun1.l.google.com:19302"
                }

            ]

        });


    localStream
        .getTracks()
        .forEach(track => {

            peerConnection.addTrack(
                track,
                localStream
            );

        });


    peerConnection.ontrack =
        event => {

            console.log(
                "Remote video received."
            );

            remoteVideo.srcObject =
                event.streams[0];

            remotePlaceholder
                .classList
                .add("hidden");

        };


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

            } catch (err) {

                console.error(
                    "ICE candidate error:",
                    err
                );

            }

        };


    peerConnection
        .onconnectionstatechange =
        () => {

            console.log(
                "WebRTC:",
                peerConnection.connectionState
            );

            status(
                peerConnection.connectionState
            );

        };

}


/* =========================
   ICE
========================= */

function listenForCandidates() {

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

                    } catch (err) {

                        console.error(
                            "ICE error:",
                            err
                        );

                    }

                });

        }
    );

}


/* =========================
   CREATE ROOM
========================= */

async function createRoom() {

    console.log(
        "CREATE ROOM CLICKED"
    );

    error("");

    try {

        status(
            "Connecting to Firebase..."
        );

        await authReady;


        if (!currentUser) {

            throw new Error(
                "Firebase authentication failed."
            );

        }


        /*
         * This should trigger the
         * browser camera permission.
         */

        await startCamera();


        roomId =
            generateRoomId();


        console.log(
            "Room:",
            roomId
        );


        roomRef =
            doc(
                db,
                "rooms",
                roomId
            );


        createPeerConnection();


        await setDoc(
            roomRef,
            {

                createdBy:
                    currentUser.uid,

                createdAt:
                    Date.now(),

                status:
                    "waiting"

            }
        );


        const offer =
            await peerConnection
                .createOffer();


        await peerConnection
            .setLocalDescription(
                offer
            );


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


        /*
         * Wait for second person.
         */

        onSnapshot(
            roomRef,
            async snapshot => {

                const data =
                    snapshot.data();


                if (
                    data &&
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

                    status(
                        "Connected"
                    );

                }

            }
        );


        listenForCandidates();


        welcomePanel
            .classList
            .add("hidden");


        roomLabel.textContent =
            "Room: " + roomId;


        status(
            "Waiting for someone..."
        );


        const url =
            window.location.pathname +
            "?room=" +
            roomId;


        window.history.replaceState(
            {},
            "",
            url
        );


        toastMessage(
            "Room created!"
        );


        console.log(
            "ROOM CREATED SUCCESSFULLY"
        );

    } catch (err) {

        console.error(
            "CREATE ROOM ERROR:",
            err
        );

        error(
            err.message ||
            "Unable to create room."
        );

    }

}


/* =========================
   JOIN ROOM
========================= */

async function joinRoom() {

    error("");

    try {

        await authReady;

        await startCamera();


        const code =
            roomInput.value
                .trim()
                .toUpperCase();


        if (!code) {

            throw new Error(
                "Enter a room code."
            );

        }


        roomId =
            code;


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
                "Room not found."
            );

        }


        const room =
            snapshot.data();


        if (!room.offer) {

            throw new Error(
                "That room isn't ready yet."
            );

        }


        createPeerConnection();


        await peerConnection
            .setRemoteDescription(

                new RTCSessionDescription(
                    room.offer
                )

            );


        remoteDescriptionSet =
            true;


        const answer =
            await peerConnection
                .createAnswer();


        await peerConnection
            .setLocalDescription(
                answer
            );


        await updateDoc(
            roomRef,
            {

                answer: {

                    type:
                        answer.type,

                    sdp:
                        answer.sdp

                }

            }
        );


        listenForCandidates();


        welcomePanel
            .classList
            .add("hidden");


        roomLabel.textContent =
            "Room: " + roomId;


        status(
            "Connecting..."
        );


    } catch (err) {

        console.error(err);

        error(
            err.message
        );

    }

}


/* =========================
   BUTTONS
========================= */

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


/* =========================
   MICROPHONE
========================= */

micButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) return;

            const tracks =
                localStream.getAudioTracks();

            tracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });

            micButton.textContent =
                tracks[0]?.enabled
                    ? "🎤"
                    : "🔇";

        }
    );


/* =========================
   CAMERA
========================= */

cameraButton
    .addEventListener(
        "click",
        () => {

            if (!localStream) return;

            const tracks =
                localStream.getVideoTracks();

            tracks.forEach(track => {

                track.enabled =
                    !track.enabled;

            });

            cameraButton.textContent =
                tracks[0]?.enabled
                    ? "📹"
                    : "🚫";

        }
    );


/* =========================
   COPY LINK
========================= */

copyRoomButton
    .addEventListener(
        "click",
        async () => {

            if (!roomId) return;

            const link =
                window.location.origin +
                window.location.pathname +
                "?room=" +
                roomId;

            await navigator.clipboard
                .writeText(link);

            toastMessage(
                "Link copied!"
            );

        }
    );


/* =========================
   HANG UP
========================= */

hangupButton
    .addEventListener(
        "click",
        () => {

            if (peerConnection) {

                peerConnection.close();

                peerConnection =
                    null;

            }


            if (localStream) {

                localStream
                    .getTracks()
                    .forEach(track => {

                        track.stop();

                    });

                localStream =
                    null;

            }


            localVideo.srcObject =
                null;

            remoteVideo.srcObject =
                null;


            remotePlaceholder
                .classList
                .remove("hidden");


            welcomePanel
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


            status(
                "Ready"
            );

        }
    );


/* =========================
   START
========================= */

authReady
    .then(() => {

        console.log(
            "VIDEO CHAT INITIALIZED"
        );

        status("Ready");

    })
    .catch(err => {

        console.error(
            "Firebase startup error:",
            err
        );

    });
