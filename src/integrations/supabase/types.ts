export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          client_id: string | null;
          company_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json | null;
          summary: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          summary: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          all_day: boolean;
          company_id: string | null;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          event_type: Database["public"]["Enums"]["event_type"];
          id: string;
          notes: string | null;
          starts_at: string;
          title: string;
        };
        Insert: {
          all_day?: boolean;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          event_type?: Database["public"]["Enums"]["event_type"];
          id?: string;
          notes?: string | null;
          starts_at: string;
          title: string;
        };
        Update: {
          all_day?: boolean;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          event_type?: Database["public"]["Enums"]["event_type"];
          id?: string;
          notes?: string | null;
          starts_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      client_portal_users: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          assigned_consultant: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["client_status"];
          updated_at: string;
        };
        Insert: {
          assigned_consultant?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          updated_at?: string;
        };
        Update: {
          assigned_consultant?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          business_email: string | null;
          business_phone: string | null;
          city: string | null;
          client_id: string;
          created_at: string;
          dba: string | null;
          ein: string | null;
          entity_type: Database["public"]["Enums"]["entity_type"] | null;
          id: string;
          industry: string | null;
          lease_status: string | null;
          legal_name: string;
          postal_code: string | null;
          state: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          business_email?: string | null;
          business_phone?: string | null;
          city?: string | null;
          client_id: string;
          created_at?: string;
          dba?: string | null;
          ein?: string | null;
          entity_type?: Database["public"]["Enums"]["entity_type"] | null;
          id?: string;
          industry?: string | null;
          lease_status?: string | null;
          legal_name: string;
          postal_code?: string | null;
          state?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          business_email?: string | null;
          business_phone?: string | null;
          city?: string | null;
          client_id?: string;
          created_at?: string;
          dba?: string | null;
          ein?: string | null;
          entity_type?: Database["public"]["Enums"]["entity_type"] | null;
          id?: string;
          industry?: string | null;
          lease_status?: string | null;
          legal_name?: string;
          postal_code?: string | null;
          state?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      credentials: {
        Row: {
          category: Database["public"]["Enums"]["credential_category"];
          company_id: string;
          created_at: string;
          id: string;
          label: string;
          last_updated_at: string;
          provider: string | null;
          username_hint: string | null;
          vault_reference: string | null;
        };
        Insert: {
          category?: Database["public"]["Enums"]["credential_category"];
          company_id: string;
          created_at?: string;
          id?: string;
          label: string;
          last_updated_at?: string;
          provider?: string | null;
          username_hint?: string | null;
          vault_reference?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["credential_category"];
          company_id?: string;
          created_at?: string;
          id?: string;
          label?: string;
          last_updated_at?: string;
          provider?: string | null;
          username_hint?: string | null;
          vault_reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credentials_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          client_id: string | null;
          company_id: string | null;
          created_at: string;
          file_name: string;
          file_path: string;
          folder: string;
          id: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
        };
        Insert: {
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          file_name: string;
          file_path: string;
          folder?: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Update: {
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          file_name?: string;
          file_path?: string;
          folder?: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      funding_applications: {
        Row: {
          approved_amount: number | null;
          apr: number | null;
          company_id: string;
          created_at: string;
          id: string;
          lender: string;
          notes: string | null;
          position: number;
          requested_amount: number | null;
          stage: Database["public"]["Enums"]["funding_stage"];
          term_months: number | null;
          updated_at: string;
        };
        Insert: {
          approved_amount?: number | null;
          apr?: number | null;
          company_id: string;
          created_at?: string;
          id?: string;
          lender: string;
          notes?: string | null;
          position?: number;
          requested_amount?: number | null;
          stage?: Database["public"]["Enums"]["funding_stage"];
          term_months?: number | null;
          updated_at?: string;
        };
        Update: {
          approved_amount?: number | null;
          apr?: number | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          lender?: string;
          notes?: string | null;
          position?: number;
          requested_amount?: number | null;
          stage?: Database["public"]["Enums"]["funding_stage"];
          term_months?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funding_applications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          client_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: {
          amount: number;
          created_at: string;
          description: string;
          id: string;
          invoice_id: string;
          quantity: number;
          transaction_id: string | null;
          unit_price: number;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          description: string;
          id?: string;
          invoice_id: string;
          quantity?: number;
          transaction_id?: string | null;
          unit_price?: number;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string;
          id?: string;
          invoice_id?: string;
          quantity?: number;
          transaction_id?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          company_id: string;
          created_at: string;
          due_date: string | null;
          id: string;
          invoice_number: string;
          issue_date: string;
          notes: string | null;
          paid_at: string | null;
          pdf_path: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          subtotal: number;
          tax: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          invoice_number: string;
          issue_date?: string;
          notes?: string | null;
          paid_at?: string | null;
          pdf_path?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          invoice_number?: string;
          issue_date?: string;
          notes?: string | null;
          paid_at?: string | null;
          pdf_path?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      loans: {
        Row: {
          account_number: string | null;
          apr: number | null;
          autopay: boolean;
          balance: number;
          company_id: string;
          created_at: string;
          id: string;
          lender: string;
          monthly_payment: number | null;
          next_due_date: string | null;
          notes: string | null;
          original_amount: number | null;
          updated_at: string;
        };
        Insert: {
          account_number?: string | null;
          apr?: number | null;
          autopay?: boolean;
          balance?: number;
          company_id: string;
          created_at?: string;
          id?: string;
          lender: string;
          monthly_payment?: number | null;
          next_due_date?: string | null;
          notes?: string | null;
          original_amount?: number | null;
          updated_at?: string;
        };
        Update: {
          account_number?: string | null;
          apr?: number | null;
          autopay?: boolean;
          balance?: number;
          company_id?: string;
          created_at?: string;
          id?: string;
          lender?: string;
          monthly_payment?: number | null;
          next_due_date?: string | null;
          notes?: string | null;
          original_amount?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loans_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          link: string | null;
          message: string | null;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          link?: string | null;
          message?: string | null;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          link?: string | null;
          message?: string | null;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          amount: number;
          billable: boolean;
          category: Database["public"]["Enums"]["transaction_category"];
          company_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          invoice_id: string | null;
          occurred_on: string;
          payee: string | null;
        };
        Insert: {
          amount: number;
          billable?: boolean;
          category?: Database["public"]["Enums"]["transaction_category"];
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          invoice_id?: string | null;
          occurred_on: string;
          payee?: string | null;
        };
        Update: {
          amount?: number;
          billable?: boolean;
          category?: Database["public"]["Enums"]["transaction_category"];
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          invoice_id?: string | null;
          occurred_on?: string;
          payee?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
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
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_internal: { Args: { _user_id: string }; Returns: boolean };
      user_can_access_client: {
        Args: { _client_id: string; _user_id: string };
        Returns: boolean;
      };
      user_can_access_company: {
        Args: { _company_id: string; _user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "super_admin" | "consultant" | "assistant" | "bookkeeper" | "client";
      client_status: "active" | "prospect" | "inactive" | "archived";
      credential_category:
        | "banking"
        | "irs"
        | "state"
        | "payroll"
        | "software"
        | "utility"
        | "other";
      entity_type:
        | "llc"
        | "c_corp"
        | "s_corp"
        | "sole_prop"
        | "partnership"
        | "nonprofit"
        | "other";
      event_type:
        | "loan_payment"
        | "follow_up"
        | "renewal"
        | "filing_deadline"
        | "meeting"
        | "other";
      funding_stage:
        | "researching"
        | "applied"
        | "under_review"
        | "approved"
        | "funded"
        | "denied"
        | "closed";
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "void";
      transaction_category:
        | "revenue"
        | "cogs"
        | "operating"
        | "payroll"
        | "tax"
        | "loan_payment"
        | "owner_draw"
        | "other";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["super_admin", "consultant", "assistant", "bookkeeper", "client"],
      client_status: ["active", "prospect", "inactive", "archived"],
      credential_category: ["banking", "irs", "state", "payroll", "software", "utility", "other"],
      entity_type: ["llc", "c_corp", "s_corp", "sole_prop", "partnership", "nonprofit", "other"],
      event_type: ["loan_payment", "follow_up", "renewal", "filing_deadline", "meeting", "other"],
      funding_stage: [
        "researching",
        "applied",
        "under_review",
        "approved",
        "funded",
        "denied",
        "closed",
      ],
      invoice_status: ["draft", "sent", "paid", "overdue", "void"],
      transaction_category: [
        "revenue",
        "cogs",
        "operating",
        "payroll",
        "tax",
        "loan_payment",
        "owner_draw",
        "other",
      ],
    },
  },
} as const;
