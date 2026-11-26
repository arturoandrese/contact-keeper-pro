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
      agent_import_runs: {
        Row: {
          base_id: string | null
          created_at: string
          id: string
          result: Json
          run_date: string
          source: string
        }
        Insert: {
          base_id?: string | null
          created_at?: string
          id?: string
          result: Json
          run_date: string
          source: string
        }
        Update: {
          base_id?: string | null
          created_at?: string
          id?: string
          result?: Json
          run_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_import_runs_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "bases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prospects: {
        Row: {
          base_id: string | null
          cargo: string | null
          correo_probable_1: string | null
          correo_probable_2: string | null
          correo_verificado: string | null
          created_at: string
          dominio: string | null
          empresa: string
          estado: string
          first_seen_date: string
          fuente_patron: string | null
          historial: Json
          id: string
          industria: string | null
          linkedin_norm: string | null
          linkedin_url: string | null
          nombre: string
          relevancia: number | null
          source: string
          updated_at: string
        }
        Insert: {
          base_id?: string | null
          cargo?: string | null
          correo_probable_1?: string | null
          correo_probable_2?: string | null
          correo_verificado?: string | null
          created_at?: string
          dominio?: string | null
          empresa: string
          estado?: string
          first_seen_date: string
          fuente_patron?: string | null
          historial?: Json
          id?: string
          industria?: string | null
          linkedin_norm?: string | null
          linkedin_url?: string | null
          nombre: string
          relevancia?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          base_id?: string | null
          cargo?: string | null
          correo_probable_1?: string | null
          correo_probable_2?: string | null
          correo_verificado?: string | null
          created_at?: string
          dominio?: string | null
          empresa?: string
          estado?: string
          first_seen_date?: string
          fuente_patron?: string | null
          historial?: Json
          id?: string
          industria?: string | null
          linkedin_norm?: string | null
          linkedin_url?: string | null
          nombre?: string
          relevancia?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prospects_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "bases"
            referencedColumns: ["id"]
          },
        ]
      }
      autosend_attempts: {
        Row: {
          email: string
          error: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          is_test: boolean
          queue_id: string | null
          sender: string
          sent_at: string
          status: string
          subject: string | null
          template_kind: string | null
        }
        Insert: {
          email: string
          error?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_test?: boolean
          queue_id?: string | null
          sender: string
          sent_at?: string
          status?: string
          subject?: string | null
          template_kind?: string | null
        }
        Update: {
          email?: string
          error?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_test?: boolean
          queue_id?: string | null
          sender?: string
          sent_at?: string
          status?: string
          subject?: string | null
          template_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autosend_attempts_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "autosend_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      autosend_cron_token: {
        Row: {
          id: number
          token: string
        }
        Insert: {
          id?: number
          token?: string
        }
        Update: {
          id?: number
          token?: string
        }
        Relationships: []
      }
      autosend_log: {
        Row: {
          at: string
          data: Json | null
          id: number
          level: string
          message: string
        }
        Insert: {
          at?: string
          data?: Json | null
          id?: number
          level?: string
          message: string
        }
        Update: {
          at?: string
          data?: Json | null
          id?: number
          level?: string
          message?: string
        }
        Relationships: []
      }
      autosend_optouts: {
        Row: {
          created_at: string
          email: string
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          source?: string
        }
        Relationships: []
      }
      autosend_queue: {
        Row: {
          analysis: Json | null
          analyzed_at: string | null
          apellido: string | null
          apellido2: string | null
          attempt: number
          base_id: string | null
          classification: string | null
          contact_id: string
          created_at: string
          current_email: string | null
          delivered_at: string | null
          empresa: string | null
          empresa_corta: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          mail1: string | null
          mail2: string | null
          next_action: string | null
          nombre: string | null
          reason: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_kind: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          analysis?: Json | null
          analyzed_at?: string | null
          apellido?: string | null
          apellido2?: string | null
          attempt?: number
          base_id?: string | null
          classification?: string | null
          contact_id: string
          created_at?: string
          current_email?: string | null
          delivered_at?: string | null
          empresa?: string | null
          empresa_corta?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          mail1?: string | null
          mail2?: string | null
          next_action?: string | null
          nombre?: string | null
          reason?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_kind?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          analysis?: Json | null
          analyzed_at?: string | null
          apellido?: string | null
          apellido2?: string | null
          attempt?: number
          base_id?: string | null
          classification?: string | null
          contact_id?: string
          created_at?: string
          current_email?: string | null
          delivered_at?: string | null
          empresa?: string | null
          empresa_corta?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          mail1?: string | null
          mail2?: string | null
          next_action?: string | null
          nombre?: string | null
          reason?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_kind?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      autosend_settings: {
        Row: {
          bounce_stop_threshold: number
          daily_limit: number
          id: number
          include_optout: boolean
          interval_minutes: number
          last_tick_at: string | null
          recontact_days: number
          send_days: number[]
          sender_email: string
          sender_name: string
          status: string
          stop_reason: string | null
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          bounce_stop_threshold?: number
          daily_limit?: number
          id?: number
          include_optout?: boolean
          interval_minutes?: number
          last_tick_at?: string | null
          recontact_days?: number
          send_days?: number[]
          sender_email?: string
          sender_name?: string
          status?: string
          stop_reason?: string | null
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Update: {
          bounce_stop_threshold?: number
          daily_limit?: number
          id?: number
          include_optout?: boolean
          interval_minutes?: number
          last_tick_at?: string | null
          recontact_days?: number
          send_days?: number[]
          sender_email?: string
          sender_name?: string
          status?: string
          stop_reason?: string | null
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      autosend_templates: {
        Row: {
          body: string
          kind: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          kind: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          kind?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      ccp_pin_state: {
        Row: {
          failed_count: number
          hash: string | null
          id: number
          locked_until: string | null
          owner_user_id: string | null
          pin_version: string | null
          salt: string | null
          updated_at: string
        }
        Insert: {
          failed_count?: number
          hash?: string | null
          id?: number
          locked_until?: string | null
          owner_user_id?: string | null
          pin_version?: string | null
          salt?: string | null
          updated_at?: string
        }
        Update: {
          failed_count?: number
          hash?: string | null
          id?: number
          locked_until?: string | null
          owner_user_id?: string | null
          pin_version?: string | null
          salt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ccp_sessions: {
        Row: {
          created_at: string
          expires_at: string
          revoked_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          revoked_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      company_industries: {
        Row: {
          empresa_short: string
          industry: string
          updated_at: string | null
        }
        Insert: {
          empresa_short: string
          industry?: string
          updated_at?: string | null
        }
        Update: {
          empresa_short?: string
          industry?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_short_names: {
        Row: {
          empresa_key: string
          short_name: string
          updated_at: string
        }
        Insert: {
          empresa_key: string
          short_name: string
          updated_at?: string
        }
        Update: {
          empresa_key?: string
          short_name?: string
          updated_at?: string
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
      prospects: {
        Row: {
          company: string
          contact_name: string
          created_at: string | null
          email: string | null
          id: string
          industry: string | null
          note: string | null
          referred_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company?: string
          contact_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          note?: string | null
          referred_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company?: string
          contact_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          note?: string | null
          referred_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      protected_companies: {
        Row: {
          created_at: string
          dominio: string | null
          dominios_alt: string[]
          estado: string
          id: string
          motivo: string
          nombre_comercial: string
          nota: string | null
          razon_social: string | null
        }
        Insert: {
          created_at?: string
          dominio?: string | null
          dominios_alt?: string[]
          estado?: string
          id?: string
          motivo?: string
          nombre_comercial: string
          nota?: string | null
          razon_social?: string | null
        }
        Update: {
          created_at?: string
          dominio?: string | null
          dominios_alt?: string[]
          estado?: string
          id?: string
          motivo?: string
          nombre_comercial?: string
          nota?: string | null
          razon_social?: string | null
        }
        Relationships: []
      }
      protected_contacts: {
        Row: {
          apellidos: string | null
          cargo: string | null
          correos: string[]
          created_at: string
          empresa: string | null
          estado: string
          id: string
          linkedin: string | null
          motivo: string
          nombre: string
        }
        Insert: {
          apellidos?: string | null
          cargo?: string | null
          correos?: string[]
          created_at?: string
          empresa?: string | null
          estado?: string
          id?: string
          linkedin?: string | null
          motivo?: string
          nombre: string
        }
        Update: {
          apellidos?: string | null
          cargo?: string | null
          correos?: string[]
          created_at?: string
          empresa?: string | null
          estado?: string
          id?: string
          linkedin?: string | null
          motivo?: string
          nombre?: string
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
      scheduled_reminders: {
        Row: {
          created_at: string | null
          email: string
          id: string
          note: string | null
          scheduled_date: string
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          note?: string | null
          scheduled_date: string
          status?: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          note?: string | null
          scheduled_date?: string
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent007_import_prospects: {
        Args: { p_dry_run?: boolean; p_payload: Json; p_run_date?: string }
        Returns: Json
      }
      agent007_norm: { Args: { t: string }; Returns: string }
      autosend_claim_next: {
        Args: never
        Returns: {
          analysis: Json | null
          analyzed_at: string | null
          apellido: string | null
          apellido2: string | null
          attempt: number
          base_id: string | null
          classification: string | null
          contact_id: string
          created_at: string
          current_email: string | null
          delivered_at: string | null
          empresa: string | null
          empresa_corta: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          mail1: string | null
          mail2: string | null
          next_action: string | null
          nombre: string | null
          reason: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_kind: string | null
          updated_at: string
          web: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "autosend_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ccp_pin_begin: { Args: never; Returns: Json }
      ccp_pin_success: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
