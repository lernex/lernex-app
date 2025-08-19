export type Json =
  | string | number | boolean | null
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
          full_name: string | null;
          avatar_url: string | null;
          is_premium: boolean | null;
          interests: string[] | null;
          level_map: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never } | {
      ensure_profile: { Args: Record<string, never>; Returns: void }
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
