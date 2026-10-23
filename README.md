# HostelHub — Hostel Allocation System

A full-stack web application for hostel allocation, connecting students with hostel managers.

## How to Run

### 1. Install dependencies (first time only)
Open a terminal and run:
```
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --ignore-scripts
```
in the `backend` folder.

### 2. Start the server
```
node server.js
```
in the `backend` folder.

### 3. Open in your browser
```
http://localhost:3000
```

---

## Features

| Feature | Details |
|---|---|
| **Landing page** | Browse all hostels, search by name/city |
| **Student sign-in** | `/pages/student-login.html` — register & login |
| **Manager sign-in** | `/pages/manager-login.html` — register & login |
| **Register hostel** | Managers add hostel name, address, price, amenities, cover photo, and pin location on a map |
| **Add rooms** | Managers add rooms with photo, type (single/double/triple/dormitory), price |
| **Hostel detail page** | Students view rooms, see location on a Leaflet map, book rooms |
| **Messaging** | Students and managers chat directly; unread badge shown on dashboard |
| **Student dashboard** | Overview stats, browse hostels, track bookings |
| **Manager dashboard** | Manage hostels & rooms, approve/reject bookings, edit hostel location |

## Project Structure

```
hostel-system/
├── backend/
│   ├── server.js            # Express server entry point
│   ├── database.js          # SQLite setup (node-sqlite3-wasm)
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication middleware
│   │   └── upload.js        # Multer image upload middleware
│   ├── routes/
│   │   ├── auth.js          # /api/auth/* (register, login, me)
│   │   ├── hostels.js       # /api/hostels/*
│   │   ├── rooms.js         # /api/rooms/* (+ bookings)
│   │   └── messages.js      # /api/messages/*
│   └── uploads/             # Uploaded images stored here
└── frontend/
    ├── index.html                    # Landing page
    ├── css/style.css                 # Shared stylesheet
    ├── js/api.js                     # Fetch helper + auth utils
    └── pages/
        ├── student-login.html        # Student register/login
        ├── manager-login.html        # Manager register/login
        ├── student-dashboard.html    # Student portal
        ├── manager-dashboard.html    # Manager portal
        ├── register-hostel.html      # Add hostel + rooms
        ├── hostel-detail.html        # Hostel view + map + booking
        └── messages.html             # Real-time-style messaging
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | — | Register student or manager |
| POST | /api/auth/login | — | Login |
| GET | /api/auth/me | ✓ | Get current user |
| GET | /api/hostels | — | List all hostels |
| GET | /api/hostels/my | Manager | Manager's own hostels |
| GET | /api/hostels/:id | — | Hostel detail + rooms |
| POST | /api/hostels | Manager | Create hostel |
| PUT | /api/hostels/:id | Manager | Update hostel |
| DELETE | /api/hostels/:id | Manager | Delete hostel |
| POST | /api/rooms | Manager | Add room to hostel |
| PUT | /api/rooms/:id | Manager | Update room |
| DELETE | /api/rooms/:id | Manager | Delete room |
| POST | /api/rooms/:id/book | Student | Book a room |
| GET | /api/rooms/bookings/my | Student | My bookings |
| GET | /api/rooms/bookings/hostel/:id | Manager | Hostel bookings |
| PUT | /api/rooms/bookings/:id | Manager | Approve/reject booking |
| POST | /api/messages | ✓ | Send message |
| GET | /api/messages/conversations | ✓ | List conversations |
| GET | /api/messages/:userId | ✓ | Get conversation |
| GET | /api/messages/unread/count | ✓ | Unread count |
