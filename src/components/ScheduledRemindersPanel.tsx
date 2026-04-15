import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Check, Trash2, ExternalLink, ArrowLeft, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Reminder {
  id: string;
  email: string;
  subject: string;
  note: string;
  scheduled_date: string;
  status: string;
  created_at: string;
}

interface ScheduledRemindersPanelProps {
  onBack: () => void;
  prefill?: { email: string; subject: string } | null;
  onClearPrefill?: () => void;
}

interface ContactSuggestion {
  email: string;
  label: string;
}

export default function ScheduledRemindersPanel({ onBack, prefill, onClearPrefill }: ScheduledRemindersPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState<Date>();
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactSuggestion[]>([]);

  useEffect(() => {
    fetchReminders();
    loadContacts();
  }, []);

  useEffect(() => {
    if (prefill) {
      setEmail(prefill.email);
      setSearchQuery(prefill.email);
      setSubject(prefill.subject);
      setShowForm(true);
      onClearPrefill?.();
    }
  }, [prefill]);

  const loadContacts = async () => {
    const contactMap = new Map<string, ContactSuggestion>();

    // Load from delivered_contacts
    const { data: delivered } = await supabase
      .from("delivered_contacts")
      .select("mail, nombre, apellido, empresa")
      .limit(2000);
    if (delivered) {
      for (const c of delivered) {
        if (!c.mail) continue;
        const label = [c.nombre, c.apellido, c.empresa ? `(${c.empresa})` : ""].filter(Boolean).join(" ").trim();
        contactMap.set(c.mail.toLowerCase(), { email: c.mail, label: label || c.mail });
      }
    }

    // Load from replied_contacts
    const { data: replied } = await supabase
      .from("replied_contacts")
      .select("email, nombre, apellido, empresa");
    if (replied) {
      for (const c of replied) {
        if (!c.email) continue;
        const label = [c.nombre, c.apellido, c.empresa ? `(${c.empresa})` : ""].filter(Boolean).join(" ").trim();
        contactMap.set(c.email.toLowerCase(), { email: c.email, label: label || c.email });
      }
    }

    setAllContacts(Array.from(contactMap.values()));
  };

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = allContacts
      .filter(c => c.email.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      .slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [searchQuery, allContacts]);

  const fetchReminders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("scheduled_reminders")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_date", { ascending: true });
    setReminders((data as Reminder[]) || []);
    setLoading(false);
  };

  const addReminder = async () => {
    if (!email || !date) {
      toast.error("Email y fecha son obligatorios");
      return;
    }
    const { error } = await supabase.from("scheduled_reminders").insert({
      email,
      subject,
      note,
      scheduled_date: format(date, "yyyy-MM-dd"),
    });
    if (error) {
      toast.error("Error al guardar");
      return;
    }
    toast.success("Recordatorio agendado");
    setEmail("");
    setSearchQuery("");
    setSubject("");
    setNote("");
    setDate(undefined);
    setShowForm(false);
    fetchReminders();
  };

  const markDone = async (id: string) => {
    await supabase.from("scheduled_reminders").update({ status: "done" }).eq("id", id);
    fetchReminders();
  };

  const deleteReminder = async (id: string) => {
    await supabase.from("scheduled_reminders").delete().eq("id", id);
    fetchReminders();
  };

  const openGmail = (r: Reminder) => {
    const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(r.email)}&su=${encodeURIComponent(r.subject || "")}`;
    window.open(url, "_blank");
  };

  const today = format(new Date(), "yyyy-MM-dd");

  const todayReminders = reminders.filter(r => r.scheduled_date === today);
  const futureReminders = reminders.filter(r => r.scheduled_date > today);
  const overdueReminders = reminders.filter(r => r.scheduled_date < today);

  const ReminderCard = ({ r, highlight }: { r: Reminder; highlight?: string }) => (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-lg border p-3",
      highlight === "today" && "border-amber-500/40 bg-amber-500/5",
      highlight === "overdue" && "border-destructive/40 bg-destructive/5",
      !highlight && "border-border bg-card"
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{r.email}</p>
          {highlight === "today" && <Badge variant="secondary" className="text-[10px]">Hoy</Badge>}
          {highlight === "overdue" && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
        </div>
        {r.subject && <p className="text-xs text-foreground/80 truncate mt-0.5">{r.subject}</p>}
        {r.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{r.note}</p>}
        <p className="text-[10px] text-muted-foreground mt-1">
          {format(new Date(r.scheduled_date + "T12:00:00"), "d MMM yyyy", { locale: es })}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(highlight === "today" || highlight === "overdue") && (
          <Button size="sm" variant="default" onClick={() => openGmail(r)} title="Abrir Gmail">
            <ExternalLink className="h-3 w-3 mr-1" /> Enviar
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markDone(r.id)} title="Marcar hecho">
          <Check className="h-3.5 w-3.5 text-green-500" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteReminder(r.id)} title="Eliminar">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <h2 className="font-display text-2xl font-bold">Agenda</h2>
          {todayReminders.length > 0 && (
            <Badge variant="destructive">{todayReminders.length} hoy</Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo recordatorio
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar por nombre o email *"
                  className="pl-8"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setEmail(e.target.value);
                  }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
              </div>
              {showSuggestions && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map(s => (
                    <button
                      key={s.email}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex flex-col"
                      onMouseDown={() => {
                        setEmail(s.email);
                        setSearchQuery(s.email);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="font-medium truncate">{s.label}</span>
                      <span className="text-xs text-muted-foreground truncate">{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input placeholder="Asunto" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <Input placeholder="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "d MMM yyyy", { locale: es }) : "Elegir fecha *"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={d => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button onClick={addReminder}>Agendar</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
      ) : reminders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay recordatorios pendientes</p>
      ) : (
        <div className="space-y-4">
          {overdueReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-destructive">⚠️ Atrasados ({overdueReminders.length})</h3>
              {overdueReminders.map(r => <ReminderCard key={r.id} r={r} highlight="overdue" />)}
            </div>
          )}
          {todayReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">📅 Hoy ({todayReminders.length})</h3>
              {todayReminders.map(r => <ReminderCard key={r.id} r={r} highlight="today" />)}
            </div>
          )}
          {futureReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Próximos ({futureReminders.length})</h3>
              {futureReminders.map(r => <ReminderCard key={r.id} r={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
