import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Customer = Tables<"customers">;
type Note = Tables<"customer_notes">;

export default function Customers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");

  const { data: studio } = useQuery({
    queryKey: ["my-studio", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("studios").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", studio?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("studio_id", studio!.id).order("name");
      return (data ?? []) as Customer[];
    },
    enabled: !!studio,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["customer-notes", studio?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customer_notes").select("*").eq("studio_id", studio!.id).order("created_at");
      return (data ?? []) as Note[];
    },
    enabled: !!studio,
  });

  // Owners add walk-in and phone customers by hand here; customers who book
  // online are added automatically by the bookings trigger.
  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("customers").insert({
      studio_id: studio!.id,
      name,
      email,
      phone: phone || null,
    });
    if (error) toast.error(error.message);
    else {
      setName("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const addNote = async (customerId: string) => {
    const { error } = await supabase.from("customer_notes").insert({
      studio_id: studio!.id,
      customer_id: customerId,
      body: noteBody,
    });
    if (error) toast.error(error.message);
    else {
      setNoteBody("");
      setNoteFor(null);
      qc.invalidateQueries({ queryKey: ["customer-notes"] });
    }
  };

  if (!studio) return null;

  return (
    <div className="container space-y-6 py-8">
      <h1 className="text-2xl font-semibold">Customers</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add a customer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addCustomer} className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <ul className="divide-y rounded-lg border bg-card">
        {customers.map((c) => (
          <li key={c.id} className="p-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setNoteFor(noteFor === c.id ? null : c.id)}>
                Add note
              </Button>
            </div>
            {notes
              .filter((n) => n.customer_id === c.id)
              .map((n) => (
                <p key={n.id} className="mt-1 text-muted-foreground">{n.body}</p>
              ))}
            {noteFor === c.id && (
              <div className="mt-2 flex gap-2">
                <Input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="e.g. prefers the afternoon class" />
                <Button size="sm" onClick={() => addNote(c.id)} disabled={!noteBody}>Save</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
