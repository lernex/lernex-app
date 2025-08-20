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
    };
    Views: { [key: string]: never };
    Functions: {
      // If you created ensure_profile() per earlier steps:
      ensure_profile?: { Args: Record<string, never>; Returns: void };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
