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
        };
        Insert: {
          id: string;
          username?: string | null;
          streak?: number | null;
          points?: number | null;
          last_study_date?: string | null;
        };
        Update: {
          id?: string;
          username?: string | null;
          streak?: number | null;
          points?: number | null;
          last_study_date?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}