export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          deposit_pence: number
          id: string
          manage_token: string
          notes: string | null
          reminder_sent_at: string | null
          seats: number
          session_id: string
          status: string
          studio_id: string
          total_pence: number
          voucher_code: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          deposit_pence: number
          id?: string
          manage_token?: string
          notes?: string | null
          reminder_sent_at?: string | null
          seats: number
          session_id: string
          status?: string
          studio_id: string
          total_pence: number
          voucher_code?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          deposit_pence?: number
          id?: string
          manage_token?: string
          notes?: string | null
          reminder_sent_at?: string | null
          seats?: number
          session_id?: string
          status?: string
          studio_id?: string
          total_pence?: number
          voucher_code?: string | null
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          body: string
          created_at: string
          customer_id: string
          id: string
          studio_id: string
        }
        Insert: {
          body: string
          created_at?: string
          customer_id: string
          id?: string
          studio_id: string
        }
        Update: {
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          studio_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string
          id: string
          marketing_opt_in: boolean
          name: string
          phone: string | null
          studio_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          marketing_opt_in?: boolean
          name: string
          phone?: string | null
          studio_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          marketing_opt_in?: boolean
          name?: string
          phone?: string | null
          studio_id?: string
        }
        Relationships: []
      }
      gift_vouchers: {
        Row: {
          balance_pence: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_pence: number
          purchaser_email: string | null
          studio_id: string
        }
        Insert: {
          balance_pence: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_pence: number
          purchaser_email?: string | null
          studio_id: string
        }
        Update: {
          balance_pence?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_pence?: number
          purchaser_email?: string | null
          studio_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          duration_min: number
          id: string
          level: string
          materials_fee_pence: number
          price_pence: number
          published: boolean
          starts_at: string
          studio_id: string
          title: string
        }
        Insert: {
          capacity: number
          created_at?: string
          description?: string | null
          duration_min: number
          id?: string
          level?: string
          materials_fee_pence?: number
          price_pence: number
          published?: boolean
          starts_at: string
          studio_id: string
          title: string
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          level?: string
          materials_fee_pence?: number
          price_pence?: number
          published?: boolean
          starts_at?: string
          studio_id?: string
          title?: string
        }
        Relationships: []
      }
      studios: {
        Row: {
          contact_email: string
          created_at: string
          deposit_pct: number
          id: string
          name: string
          owner_id: string
          slug: string
        }
        Insert: {
          contact_email: string
          created_at?: string
          deposit_pct?: number
          id?: string
          name: string
          owner_id: string
          slug: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          deposit_pct?: number
          id?: string
          name?: string
          owner_id?: string
          slug?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          session_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          session_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          session_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      lookup_customer: {
        Args: { p_email: string }
        Returns: {
          created_at: string
          email: string
          id: string
          marketing_opt_in: boolean
          name: string
          phone: string | null
          studio_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
