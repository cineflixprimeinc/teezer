import { api } from "./api";

export interface NotificationPrefs {
  push_likes:     boolean;
  push_comments:  boolean;
  push_followers: boolean;
  push_mentions:  boolean;
  push_messages:  boolean;
  push_live:      boolean;
  push_following: boolean;
  push_creator:   boolean;
  email_security: boolean;
  email_account:  boolean;
  email_promo:    boolean;
  email_news:     boolean;
  sms_otp:        boolean;
  sms_security:   boolean;
  sms_updates:    boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  push_likes: true,  push_comments: true,  push_followers: true,
  push_mentions: true, push_messages: true, push_live: false,
  push_following: true, push_creator: false,
  email_security: true, email_account: true, email_promo: false, email_news: false,
  sms_otp: true, sms_security: true, sms_updates: false,
};

export const notificationsService = {
  async get(): Promise<NotificationPrefs> {
    const { data } = await api.get("/profile/notifications");
    return data.data;
  },

  async save(prefs: NotificationPrefs): Promise<NotificationPrefs> {
    const { data } = await api.patch("/profile/notifications", prefs);
    return data.data;
  },
};
