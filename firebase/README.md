# Firebase setup

This app uses **Firebase Auth**, **Firestore**, and **Storage** directly from
the browser via the Firebase JS SDK. There is no Node/Express backend.

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and create a project.
2. Add a **Web app** to it and copy the config object.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. In **Firestore Database**, create a database in production mode.
5. In **Storage**, enable the default bucket.

## 2. Configure environment variables

Copy `.env.example` to `.env` and paste your Firebase config values:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-app
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc...
```

These are publishable client keys — safe to expose. Security is enforced by
the Firestore + Storage rules.

## 3. Deploy security rules

Copy the contents of `firestore.rules` and `storage.rules` into the
Firebase Console (Firestore → Rules / Storage → Rules) and publish.

Or with the Firebase CLI:

```
firebase deploy --only firestore:rules,storage
```

## 4. Create your first admin

The **first user who signs up** automatically becomes the admin (we check
if any `roles/*` document with `role: "admin"` exists before assigning).
Every subsequent sign-up is a regular employee.

To create more admins, edit the user's `roles/{uid}` document in Firestore
and set `role: "admin"`.

## Collections

| Collection   | Document ID                  | Purpose                          |
| ------------ | ---------------------------- | -------------------------------- |
| `roles`      | `{uid}`                      | `{ role: "admin" \| "employee" }` |
| `employees`  | `{uid}`                      | Employee profile                 |
| `tasks`      | auto                         | Task assignments                 |
| `attendance` | `{uid}_{yyyy-mm-dd}`         | Daily check in/out with GPS      |
| `photos`     | auto                         | Field photo metadata             |
| `locations`  | auto                         | Optional location pings          |

## Storage layout

```
field-photos/
  {uid}/
    {timestamp}_{filename}.jpg
```