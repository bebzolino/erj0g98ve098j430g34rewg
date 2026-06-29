# Notification Queue Timing Policy

This example describes a queue policy for sending notifications in a way that feels less abrupt and better matched to the recipient.

See `notification-queue-policy.example.json` for the sample configuration.

## 1. Delay Based On Content Length

Before a notification is sent, the scheduler calculates a preparation delay from the message content:

```text
delay =
  baseDelayMs
  + characterCount * perCharacterMs
  + wordCount * perWordMs
  + random(jitterMs.min, jitterMs.max)
```

Then the value is clamped between `minDelayMs` and `maxDelayMs`.

Example:

- `Ok` should be sent quickly, because it only adds a small content delay.
- A long, detailed notification gets a larger delay, but never more than `maxDelayMs`.
- `jitterMs` prevents every notification with the same length from being sent with the exact same timing.

## 2. Recipient-Aware Send Time

After the content delay is calculated, the scheduler adjusts it using recipient context:

- Resolve the recipient timezone from `recipient.profile.timezone`.
- If timezone is missing, use `fallbackTimezone`.
- If the calculated send time falls inside `quietHours`, defer it until the quiet period ends.
- If the recipient is online, shorten the delay with the `online.multiplier`.
- If the recipient is idle, offline, or unknown, increase the delay.
- If `preferRecentActivity` is enabled, recent activity within `recentActivityWindowMinutes` can be treated as a stronger signal than a stale presence status.

In practice, the queue worker should store a `scheduledFor` timestamp rather than sleeping inside a process. This makes the behavior durable across restarts.

## Suggested Flow

1. A notification enters the queue with recipient id, content, priority, and expiration time.
2. The scheduler calculates the content-based delay.
3. The scheduler loads recipient timezone, local time, presence status, and recent activity.
4. The delay is adjusted by the matching activity rule.
5. Quiet hours and delivery limits are applied.
6. The worker saves `scheduledFor`.
7. Shortly before sending, if `recalculateBeforeSend` is true, the worker checks recipient state again and may defer the notification.
8. If `dropIfExpired` is true and the notification is older than `expiresAfterMs`, it is discarded.

## UX Notes

For normal UX notifications, this should be conservative:

- Do not send during local night hours unless the notification is urgent.
- Avoid sending many small notifications one after another.
- Batch similar notifications when possible.
- Keep a maximum delay so the system still feels responsive.
- Recalculate presence shortly before send, because online/offline state can change quickly.
