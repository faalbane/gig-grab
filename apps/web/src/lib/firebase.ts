import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  signInWithPopup,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function app(): FirebaseApp {
  if (_app) return _app;
  _app = getApps()[0] ?? initializeApp(config);
  return _app;
}

export function auth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(app());
  return _auth;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth(), provider);
}

export async function signInWithMicrosoft() {
  const provider = new OAuthProvider("microsoft.com");
  return signInWithPopup(auth(), provider);
}

const STORAGE_KEY_EMAIL = "gigrab.signin.email";

export async function startEmailMagicLink(email: string) {
  const url = `${window.location.origin}/auth/finish`;
  await sendSignInLinkToEmail(auth(), email, {
    url,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(STORAGE_KEY_EMAIL, email);
}

export async function finishEmailMagicLink() {
  if (!isSignInWithEmailLink(auth(), window.location.href)) return null;
  let email = window.localStorage.getItem(STORAGE_KEY_EMAIL);
  if (!email) email = window.prompt("Enter your email to confirm sign-in.");
  if (!email) return null;
  const result = await signInWithEmailLink(auth(), email, window.location.href);
  window.localStorage.removeItem(STORAGE_KEY_EMAIL);
  return result;
}

// ----- Phone sign-in (Firebase Auth phone provider) -----
//
// Requires the Phone provider to be enabled in Firebase Console:
//   Authentication → Sign-in method → Phone → Enable.
// Firebase uses an invisible reCAPTCHA on the page; we mount it once on a
// hidden div with id="phone-auth-recaptcha".

let _recaptcha: RecaptchaVerifier | null = null;

function getRecaptcha(): RecaptchaVerifier {
  if (_recaptcha) return _recaptcha;
  // The container element is rendered by the AuthCard component.
  _recaptcha = new RecaptchaVerifier(auth(), "phone-auth-recaptcha", {
    size: "invisible",
  });
  return _recaptcha;
}

/** Send the SMS verification code. Returns the ConfirmationResult to confirm later. */
export async function startPhoneSignIn(
  phoneE164: string,
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth(), phoneE164, getRecaptcha());
}

/** Confirm the 6-digit SMS code. Returns the user credential. */
export async function confirmPhoneCode(
  confirmation: ConfirmationResult,
  code: string,
) {
  return confirmation.confirm(code);
}

export async function postAuthLink(idToken: string, candidateId?: string) {
  const res = await fetch("/api/auth/link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ candidateId }),
  });
  if (!res.ok) {
    throw new Error((await res.json()).error ?? "Auth link failed.");
  }
  return res.json();
}
