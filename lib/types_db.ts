// lib/types_db.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          streak: number | null;
          points: number | null;
          total_cost: number;
          last_study_date: string | null;
          // New / extended fields:
          full_name: string | null;
          avatar_url: string | null;
          is_premium: boolean | null;
          interests: string[] | null;
          level_map: Json | null;           // e.g., {"Math":"Algebra 1"}
          created_at: string | null;
          updated_at: string | null;
          dob: string | null;               // date as ISO string
          placement_ready: boolean | null;  // flag to gate /placement
        };
        Insert: {
          id: string;
          username?: string | null;
          streak?: number | null;
          points?: number | null;
          total_cost?: number;
          last_study_date?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean | null;
          interests?: string[] | null;
          level_map?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          dob?: string | null;
          placement_ready?: boolean | null;
        };
        Update: {
          id?: string;
          username?: string | null;
          streak?: number | null;
          points?: number | null;
          total_cost?: number;
          last_study_date?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean | null;
          interests?: string[] | null;
          level_map?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          dob?: string | null;
          placement_ready?: boolean | null;
        };
        Relationships: [];
      };
      user_subject_state: {
        Row: {
          user_id: string;
          subject: string;
          course: string;
          mastery: number | null;
          difficulty: "intro" | "easy" | "medium" | "hard";
          next_topic: string | null;
          path: Json | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          subject: string;
          course: string;
          mastery?: number | null;
          difficulty?: "intro" | "easy" | "medium" | "hard";
          next_topic?: string | null;
          path?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          subject?: string;
          course?: string;
          mastery?: number | null;
          difficulty?: "intro" | "easy" | "medium" | "hard";
          next_topic?: string | null;
          path?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_subject_preferences: {
        Row: {
          user_id: string;
          subject: string;
          liked_ids: string[];
          disliked_ids: string[];
          saved_ids: string[];
          tone_tags: string[];
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          subject: string;
          liked_ids?: string[];
          disliked_ids?: string[];
          saved_ids?: string[];
          tone_tags?: string[];
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          subject?: string;
          liked_ids?: string[];
          disliked_ids?: string[];
          saved_ids?: string[];
          tone_tags?: string[];
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_subject_progress: {
        Row: {
          user_id: string;
          subject: string;
          topic_idx: number | null;
          subtopic_idx: number | null;
          delivered_mini: number | null;
          delivered_by_topic: Json;
          delivered_ids_by_topic: Json;
          delivered_titles_by_topic: Json;
          completion_map: Json;
          metrics: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          subject: string;
          topic_idx?: number | null;
          subtopic_idx?: number | null;
          delivered_mini?: number | null;
          delivered_by_topic?: Json;
          delivered_ids_by_topic?: Json;
          delivered_titles_by_topic?: Json;
          completion_map?: Json;
          metrics?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          subject?: string;
          topic_idx?: number | null;
          subtopic_idx?: number | null;
          delivered_mini?: number | null;
          delivered_by_topic?: Json;
          delivered_ids_by_topic?: Json;
          delivered_titles_by_topic?: Json;
          completion_map?: Json;
          metrics?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_topic_lesson_cache: {
        Row: {
          user_id: string;
          subject: string;
          topic_label: string;
          lessons: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          subject: string;
          topic_label: string;
          lessons?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          subject?: string;
          topic_label?: string;
          lessons?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      course_outline_cache: {
        Row: {
          subject: string;
          course: string;
          outline: Json;
          embedding: number[] | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          subject: string;
          course: string;
          outline: Json;
          embedding?: number[] | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          subject?: string;
          course?: string;
          outline?: Json;
          embedding?: number[] | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      playlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_public: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      playlist_memberships: {
        Row: {
          id: string;
          playlist_id: string;
          profile_id: string;
          role: "viewer" | "moderator";
          created_at: string | null;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          profile_id: string;
          role?: "viewer" | "moderator";
          created_at?: string | null;
        };
        Update: {
          id?: string;
          playlist_id?: string;
          profile_id?: string;
          role?: "viewer" | "moderator";
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName?: string;
            columns: ["playlist_id"];
            referencedRelation: "playlists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName?: string;
            columns: ["profile_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      playlist_items: {
        Row: {
          id: string;
          playlist_id: string;
          lesson_id: string;
          position: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          lesson_id: string;
          position?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          playlist_id?: string;
          lesson_id?: string;
          position?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      attempts: {
        Row: {
          user_id: string;
          lesson_id: string | null;
          subject: string | null;
          level: string | null;
          correct_count: number | null;
          total: number | null;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          lesson_id?: string | null;
          subject?: string | null;
          level?: string | null;
          correct_count?: number | null;
          total?: number | null;
          created_at?: string | null;
        };
        Update: {
          user_id?: string;
          lesson_id?: string | null;
          subject?: string | null;
          level?: string | null;
          correct_count?: number | null;
          total?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: "pending" | "accepted" | "declined";
          message: string | null;
          created_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: "pending" | "accepted" | "declined";
          message?: string | null;
          created_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: "pending" | "accepted" | "declined";
          message?: string | null;
          created_at?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          created_at: string | null;
          last_interaction_at: string | null;
        };
        Insert: {
          id?: string;
          user_a: string;
          user_b: string;
          created_at?: string | null;
          last_interaction_at?: string | null;
        };
        Update: {
          id?: string;
          user_a?: string;
          user_b?: string;
          created_at?: string | null;
          last_interaction_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: {
      // If you created ensure_profile() per earlier steps:
      ensure_profile?: { Args: Record<string, never>; Returns: void };
      apply_user_subject_progress_patch: {
        Args: {
          p_subject: string;
          p_topic_idx?: number | null;
          p_subtopic_idx?: number | null;
          p_delivered_mini?: number | null;
          p_delivered_patch?: Json;
          p_id_patch?: Json;
          p_title_patch?: Json;
          p_completion_patch?: Json;
          p_metrics?: Json;
        };
        Returns: Database["public"]["Tables"]["user_subject_progress"]["Row"];
      };
    };
    Enums: {
      difficulty: "intro" | "easy" | "medium" | "hard";
    };
    CompositeTypes: { [key: string]: never };
  };
}
