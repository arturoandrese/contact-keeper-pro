export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bases: {
        Row: {
          clean_count: number | null
          created_at: string | null
          crossed: boolean | null
          crossed_at: string | null
          id: string
          name: string
          raw_count: number | null
          sheet_id: string | null
        }
        Insert: {
          clean_count?: number | null
          created_at?: string | null
          crossed?: boolean | null
          crossed_at?: string | null
          id?: string
          name: string
          raw_count?: number | null
          sheet_id?: string | null
        }
        Update: {
          clean_count?: number | null
          created_at?: string | null
          crossed?: boolean | null
          crossed_at?: string | null
          id?: string
          name?: string
          raw_count?: number | null
          sheet_id?: string | null
        }
        Relationships: []
      }
      bounced_emails: {
        Row: {
          bounced_at: string | null
          domain: string | null
          mail: string
        }
        Insert: {
          bounced_at?: string | null
          domain?: string | null
          mail: string
        }
        Update: {
          bounced_at?: string | null
          domain?: string | null
          mail?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          apellido: string | null
          apellido2: string | null
          base_id: string
          created_at: string | null
          empresa: string | null
          id: string
          mail1: string | null
          mail2: string | null
          mail3: string | null
          mail4: string | null
          nombre: string | null
          web: string | null
        }
        Insert: {
          apellido?: string | null
          apellido2?: string | null
          base_id: string
          created_at?: string | null
          empresa?: string | null
          id?: string
          mail1?: string | null
          mail2?: string | null
          mail3?: string | null
          mail4?: string | null
          nombre?: string | null
          web?: string | null
        }
        Update: {
          apellido?: string | null
          apellido2?: string | null
          base_id?: string
          created_at?: string | null
          empresa?: string | null
          id?: string
          mail1?: string | null
          mail2?: string | null
          mail3?: string | null
          mail4?: string | null
          nombre?: string | null
          web?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "bases"
            referencedColumns: ["id"]
          },
        ]
      }
      delivered_contacts: {
        Row: {
          apellido: string | null
          created_at: string | null
          empresa: string | null
          empresa_short: string | null
          id: string
          last_campaign: string | null
          last_contacted_at: string | null
          mail: string
          nombre: string | null
          status: string | null
          times_contacted: number | null
          web: string | null
        }
        Insert: {
          apellido?: string | null
          created_at?: string | null
          empresa?: string | null
          empresa_short?: string | null
          id?: string
          last_campaign?: string | null
          last_contacted_at?: string | null
          mail: string
          nombre?: string | null
          status?: string | null
          times_contacted?: number | null
          web?: string | null
        }
        Update: {
          apellido?: string | null
          created_at?: string | null
          empresa?: string | null
          empresa_short?: string | null
          id?: string
          last_campaign?: string | null
          last_contacted_at?: string | null
          mail?: string
          nombre?: string | null
          status?: string | null
          times_contacted?: number | null
          web?: string | null
        }
        Relationships: []
      }
      domain_patterns: {
        Row: {
          confidence: number | null
          created_at: string | null
          domain: string
          example_email: string | null
          id: string
          pattern: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          domain: string
          example_email?: string | null
          id?: string
          pattern: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          domain?: string
          example_email?: string | null
          id?: string
          pattern?: string
        }
        Relationships: []
      }
      licitaciones: {
        Row: {
          codigo: string | null
          created_at: string | null
          fecha_cierre: string | null
          fecha_publicacion: string | null
          id: string
          keyword: string | null
          monto: string | null
          nombre: string | null
          organismo: string | null
          url: string | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string | null
          fecha_cierre?: string | null
          fecha_publicacion?: string | null
          id?: string
          keyword?: string | null
          monto?: string | null
          nombre?: string | null
          organismo?: string | null
          url?: string | null
        }
        Update: {
          codigo?: string | null
          created_at?: string | null
          fecha_cierre?: string | null
          fecha_publicacion?: string | null
          id?: string
          keyword?: string | null
          monto?: string | null
          nombre?: string | null
          organismo?: string | null
          url?: string | null
        }
        Relationships: []
      }
      replied_contacts: {
        Row: {
          apellido: string | null
          cargo: string | null
          email: string
          empresa: string | null
          fecha_respuesta: string | null
          id: string
          imported_at: string | null
          nombre: string | null
        }
        Insert: {
          apellido?: string | null
          cargo?: string | null
          email: string
          empresa?: string | null
          fecha_respuesta?: string | null
          id?: string
          imported_at?: string | null
          nombre?: string | null
        }
        Update: {
          apellido?: string | null
          cargo?: string | null
          email?: string
          empresa?: string | null
          fecha_respuesta?: string | null
          id?: string
          imported_at?: string | null
          nombre?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
