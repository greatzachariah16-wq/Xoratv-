export type FeedType = "home" | "shorts" | "learn";

export interface MovieMetadata {
  id: string;
  title: string;
  year?: number | null;
  genre?: string | string[] | null;
  overview?: string | null;
  posterUrl?: string | null;
  streamUrl?: string | null;
  durationSeconds?: number | null;
  quality?: "4K" | "1080p" | "720p" | "HD" | "SD" | null;
  rating?: number | null;
  status: "published" | "draft" | "removed";
  approval_status: "approved" | "pending_review" | "rejected";
  created_at: string;
  source?: string | null;
}

export interface PostRecord {
  id: string;
  author_id: string | null;
  title: string | null;
  caption: string | null;
  kind: "video" | "text";
  feed: FeedType;
  status: "published" | "draft" | "removed";
  approval_status: "approved" | "pending_review" | "rejected";
  media_path: string | null;
  poster_path: string | null;
  stream_url?: string | null;
  duration_seconds: number | null;
  featured: boolean;
  recommendation_score: number;
  quality_score?: number | null;
  is_color?: boolean | null;
  rights_status?:
    "public_domain" | "creative_commons" | "uncertain" | "restricted" | "unknown" | null;
  source: string;
  created_at: string;
  discovered_at?: string | null;
  year?: number | null;
  genre?: string | null;
  like_count?: number;
  comment_count?: number;
}

export interface ProfileRecord {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  is_admin?: boolean | null;
  follower_count?: number;
  following_count?: number;
  created_at: string;
}

export interface CommentRecord {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface LikeRecord {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface FollowRecord {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  actor_id: string;
  kind: "like" | "comment" | "follow";
  post_id: string | null;
  read: boolean;
  created_at: string;
}

export interface DiscoveryRunRecord {
  id: string;
  started_at: string;
  completed_at: string | null;
  source: string;
  items_found: number;
  items_inserted: number;
  error_message?: string | null;
}

export interface UserSignals {
  genres?: Record<string, number>;
  authors?: Record<string, number>;
  hiddenPostIds?: Record<string, boolean>;
  hiddenAuthorIds?: Record<string, boolean>;
  updatedAt?: string;
}

export type EventType =
  | "view_start"
  | "view_3s"
  | "view_complete"
  | "like"
  | "comment"
  | "share"
  | "follow"
  | "skip"
  | "hide"
  | "not_interested"
  | "click_profile"
  | "open_video";

export interface UserEventRecord {
  type: EventType;
  postId?: string | null;
  authorId?: string | null;
  feed?: FeedType | null;
  ts: string;
  meta?: Record<string, unknown> | null;
}

export interface ChatRoomRecord {
  id: string;
  type: "dm" | "group";
  name?: string | null;
  photo_url?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  memberIds: Record<string, boolean>;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageSenderId?: string | null;
}

export interface ChatMessageRecord {
  id: string;
  roomId: string;
  senderId: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  text: string;
  created_at: string;
  type: "text" | "experience";
  experiencePostId?: string | null;
  expiresAt: string;
}

export interface DatabaseSchema {
  movies: MovieMetadata;
  posts: PostRecord;
  profiles: ProfileRecord;
  comments: CommentRecord;
  likes: LikeRecord;
  follows: FollowRecord;
  notifications: NotificationRecord;
  discovery_runs: DiscoveryRunRecord;
  chat_rooms: ChatRoomRecord;
  chat_messages: ChatMessageRecord;
}

export type Tables<T extends keyof DatabaseSchema> = DatabaseSchema[T];

export type Enums<T extends "feed_type"> = T extends "feed_type" ? FeedType : never;
