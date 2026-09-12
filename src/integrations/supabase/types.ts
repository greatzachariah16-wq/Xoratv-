export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          post_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_profile_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_runs: {
        Row: {
          duplicates: number;
          error: string | null;
          examined: number;
          finished_at: string | null;
          id: string;
          inserted: number;
          ok: boolean;
          pending: number;
          rejected: number;
          source: Database["public"]["Enums"]["content_source"];
          started_at: string;
        };
        Insert: {
          duplicates?: number;
          error?: string | null;
          examined?: number;
          finished_at?: string | null;
          id?: string;
          inserted?: number;
          ok?: boolean;
          pending?: number;
          rejected?: number;
          source: Database["public"]["Enums"]["content_source"];
          started_at?: string;
        };
        Update: {
          duplicates?: number;
          error?: string | null;
          examined?: number;
          finished_at?: string | null;
          id?: string;
          inserted?: number;
          ok?: boolean;
          pending?: number;
          rejected?: number;
          source?: Database["public"]["Enums"]["content_source"];
          started_at?: string;
        };
        Relationships: [];
      };
      discovery_settings: {
        Row: {
          id: boolean;
          updated_at: string;
          weights: Json;
        };
        Insert: {
          id?: boolean;
          updated_at?: string;
          weights: Json;
        };
        Update: {
          id?: boolean;
          updated_at?: string;
          weights?: Json;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_profile_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_profile_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_user_profile_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id: string | null;
          read: boolean;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id?: string | null;
          read?: boolean;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          post_id?: string | null;
          read?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_profile_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"];
          audio_info: string | null;
          audio_quality: string | null;
          author_id: string | null;
          canonical_url: string | null;
          caption: string;
          category: string | null;
          comment_count: number;
          created_at: string;
          discovered_at: string | null;
          duration_seconds: number | null;
          external_creator: string | null;
          external_id: string | null;
          featured: boolean;
          feed: Database["public"]["Enums"]["feed_type"];
          frame_rate: number | null;
          home_eligible: boolean;
          id: string;
          interestingness_score: number;
          is_color: boolean | null;
          keywords: string[];
          kind: Database["public"]["Enums"]["post_kind"];
          license: string | null;
          license_url: string | null;
          like_count: number;
          media_path: string | null;
          media_type: string | null;
          playback_url: string | null;
          poster_path: string | null;
          published_at: string | null;
          quality_score: number;
          recommendation_score: number;
          rejection_reason: string | null;
          resolution_height: number | null;
          rights_confidence: number;
          rights_status: Database["public"]["Enums"]["rights_status"];
          shorts_eligible: boolean;
          source: Database["public"]["Enums"]["content_source"];
          source_metadata: Json | null;
          status: Database["public"]["Enums"]["post_status"];
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"];
          audio_info?: string | null;
          audio_quality?: string | null;
          author_id?: string | null;
          canonical_url?: string | null;
          caption?: string;
          category?: string | null;
          comment_count?: number;
          created_at?: string;
          discovered_at?: string | null;
          duration_seconds?: number | null;
          external_creator?: string | null;
          external_id?: string | null;
          featured?: boolean;
          feed?: Database["public"]["Enums"]["feed_type"];
          frame_rate?: number | null;
          home_eligible?: boolean;
          id?: string;
          interestingness_score?: number;
          is_color?: boolean | null;
          keywords?: string[];
          kind?: Database["public"]["Enums"]["post_kind"];
          license?: string | null;
          license_url?: string | null;
          like_count?: number;
          media_path?: string | null;
          media_type?: string | null;
          playback_url?: string | null;
          poster_path?: string | null;
          published_at?: string | null;
          quality_score?: number;
          recommendation_score?: number;
          rejection_reason?: string | null;
          resolution_height?: number | null;
          rights_confidence?: number;
          rights_status?: Database["public"]["Enums"]["rights_status"];
          shorts_eligible?: boolean;
          source?: Database["public"]["Enums"]["content_source"];
          source_metadata?: Json | null;
          status?: Database["public"]["Enums"]["post_status"];
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"];
          audio_info?: string | null;
          audio_quality?: string | null;
          author_id?: string | null;
          canonical_url?: string | null;
          caption?: string;
          category?: string | null;
          comment_count?: number;
          created_at?: string;
          discovered_at?: string | null;
          duration_seconds?: number | null;
          external_creator?: string | null;
          external_id?: string | null;
          featured?: boolean;
          feed?: Database["public"]["Enums"]["feed_type"];
          frame_rate?: number | null;
          home_eligible?: boolean;
          id?: string;
          interestingness_score?: number;
          is_color?: boolean | null;
          keywords?: string[];
          kind?: Database["public"]["Enums"]["post_kind"];
          license?: string | null;
          license_url?: string | null;
          like_count?: number;
          media_path?: string | null;
          media_type?: string | null;
          playback_url?: string | null;
          poster_path?: string | null;
          published_at?: string | null;
          quality_score?: number;
          recommendation_score?: number;
          rejection_reason?: string | null;
          resolution_height?: number | null;
          rights_confidence?: number;
          rights_status?: Database["public"]["Enums"]["rights_status"];
          shorts_eligible?: boolean;
          source?: Database["public"]["Enums"]["content_source"];
          source_metadata?: Json | null;
          status?: Database["public"]["Enums"]["post_status"];
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_profile_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          banner_url: string | null;
          bio: string;
          created_at: string;
          display_name: string;
          follower_count: number;
          following_count: number;
          id: string;
          location: string | null;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          follower_count?: number;
          following_count?: number;
          id: string;
          location?: string | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          follower_count?: number;
          following_count?: number;
          id?: string;
          location?: string | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
      approval_status: "approved" | "pending_review" | "rejected" | "hidden";
      content_source: "creator" | "internet_archive" | "wikimedia_commons" | "nasa_svs";
      feed_type: "home" | "shorts" | "learn";
      notification_kind: "like" | "comment" | "follow";
      post_kind: "video" | "text";
      post_status: "published" | "flagged" | "removed";
      rights_status:
        "public_domain" | "cc0" | "cc_by" | "cc_by_sa" | "other_open" | "unknown" | "restricted";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      approval_status: ["approved", "pending_review", "rejected", "hidden"],
      content_source: ["creator", "internet_archive", "wikimedia_commons", "nasa_svs"],
      feed_type: ["home", "shorts", "learn"],
      notification_kind: ["like", "comment", "follow"],
      post_kind: ["video", "text"],
      post_status: ["published", "flagged", "removed"],
      rights_status: [
        "public_domain",
        "cc0",
        "cc_by",
        "cc_by_sa",
        "other_open",
        "unknown",
        "restricted",
      ],
    },
  },
} as const;
