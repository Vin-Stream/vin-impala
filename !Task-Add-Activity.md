


Authenticated users call this every few minutes. The backend updates their own lastSeenAt and usage totals.
```mongo
POST /api/activity/heartbeat
```

Admins see all users’ activity, such as last login, last seen, active minutes, login count, and device count.

```mongo
GET /api/admin/activity
```

Admins see one user’s details.

```mongo
GET /api/admin/activity/:username
```

Admins can delete activity history for a user. 

```
DELETE /api/admin/activity/:username
```

Don't need public POST, PUT, or PATCH routes for activity records. The server should derive the username from the signed session token rather than trusting a username supplied by the browser\ to prevent one user from recording activity under another user’s name.

Flow:
```process
Browser heartbeat
  -> POST /api/activity/heartbeat
  -> requireAuth
  -> identify request.user.username
  -> update MongoDB activity document

Admin dashboard
  -> GET /api/admin/activity
  -> requireAuth
  -> requireAdmin
  -> read MongoDB activity documents
```


Use your .env locally for the MongoDB connection string, but make sure the backend actually loads it in local development. Heroku will provide the same value as a config var:

 The first implementation should use MongoDB upserts and one document per username.
