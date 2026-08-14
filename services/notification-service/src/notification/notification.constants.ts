/** DI token for `NotificationDispatcher`'s injected consumer-side `DomainEventsModule` config — mirrors `recommendation-engine`'s own `DOMAIN_EVENTS_REDIS_CONFIG` token naming exactly. */
export const DOMAIN_EVENTS_REDIS_CONFIG = Symbol('DOMAIN_EVENTS_REDIS_CONFIG');

/** The real, registered consumer name this service's own queue/`Worker` uses (E16 T1's `DOMAIN_EVENT_CONSUMERS` registry). */
export const NOTIFICATION_SERVICE_CONSUMER_NAME = 'notification-service';

/** `serverUrlEnvSchema` (`APP_URL`) — needed to build a working password-reset link (`NotificationDispatcher`). */
export const NOTIFICATION_SERVER_URL_CONFIG = Symbol('NOTIFICATION_SERVER_URL_CONFIG');
