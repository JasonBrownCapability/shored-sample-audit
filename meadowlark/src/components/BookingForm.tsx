import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatPence } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  session: Tables<"sessions">;
  studio: Tables<"studios">;
  seatsLeft: number;
  onBooked: () => void;
};

type Voucher = Pick<Tables<"gift_vouchers">, "code" | "balance_pence" | "expires_at">;

export function BookingForm({ session, studio, seatsLeft, onBooked }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [seats, setSeats] = useState(1);
  const [notes, setNotes] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [busy, setBusy] = useState(false);

  // Returning customer? Fill in their name and phone from last time.
  const autofill = async () => {
    if (!email.includes("@")) return;
    const { data } = await supabase.rpc("lookup_customer", { p_email: email }).limit(1);
    const match = data?.[0];
    if (match) {
      if (!name) setName(match.name);
      if (!phone && match.phone) setPhone(match.phone);
    }
  };

  const applyVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;
    const { data } = await supabase
      .from("gift_vouchers")
      .select("code, balance_pence, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (!data || data.balance_pence <= 0) {
      toast.error("That voucher code was not recognised");
      setVoucher(null);
      return;
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      toast.error("That voucher has expired");
      setVoucher(null);
      return;
    }
    setVoucher(data);
    toast.success(`Voucher applied: ${formatPence(data.balance_pence)} available`);
  };

  // Price: seats x (class price + materials), less any voucher balance.
  // The deposit is the studio's percentage of what is left.
  const gross = seats * (session.price_pence + session.materials_fee_pence);
  const discount = Math.min(voucher?.balance_pence ?? 0, gross);
  const total = gross - discount;
  const deposit = Math.round((total * studio.deposit_pct) / 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (seats > seatsLeft) {
      toast.error(`Only ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`);
      return;
    }
    setBusy(true);

    // fix: allow inserts, was getting 401 (see migration 20250709101200)
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        studio_id: studio.id,
        session_id: session.id,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || null,
        seats,
        total_pence: total,
        deposit_pence: deposit,
        notes: notes || null,
        voucher_code: voucher?.code ?? null,
      })
      .select("id, manage_token")
      .single();

    if (error || !booking) {
      setBusy(false);
      toast.error(error?.message ?? "Booking failed");
      return;
    }

    await supabase.functions.invoke("send-booking-confirmation", {
      body: { booking_id: booking.id, email, manage_token: booking.manage_token },
    });

    setBusy(false);
    toast.success("Booked. Check your email for the details and the deposit link.");
    onBooked();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={autofill} required />
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input type="number" min={1} max={seatsLeft} value={seats} onChange={(e) => setSeats(parseInt(e.target.value) || 1)} />
      </div>
      <Input placeholder="Anything we should know? (access needs, allergies)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <Input placeholder="Gift voucher code" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} />
        <Button type="button" variant="outline" onClick={applyVoucher}>Apply</Button>
      </div>
      <p className="text-sm">
        Total {formatPence(total)}
        {discount > 0 && ` (voucher −${formatPence(discount)})`} · deposit today {formatPence(deposit)}
      </p>
      <Button type="submit" disabled={busy}>Book {seats} seat{seats === 1 ? "" : "s"}</Button>
    </form>
  );
}
