import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MailWarning, RefreshCw, Loader2, ExternalLink, ChevronDown, ChevronUp, X, CalendarDays } from "lucide-react";

interface UnansweredEmail {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  threadId: string;
}

interface Props {
  onSchedule?: (email: string, subject: string) => void;
}

export default function UnansweredEmailsAlert({ onSchedule }: Props) {
  const [emails, setEmails] = useState<UnansweredEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("dismissed_unanswered");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    const tokens = localStorage.getItem("gmail_tokens");
    if (tokens) {
      setHasToken(true);
      fetchUnanswered();
    }
  }, []);

  const getAccessToken = (): string | null => {
    try {
      const raw = localStorage.getItem("gmail_tokens");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.access_token || null;
      }
      return localStorage.getItem("gmail_token");
    } catch { return null; }
  };

  const getUserEmail = (): string => {
    try {
      const raw = localStorage.getItem("gmail_tokens");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.email || "";
      }
      return localStorage.getItem("gmail_email") || "";
    } catch { return ""; }
  };

  const fetchUnanswered = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    let userEmail = getUserEmail();
    if (!userEmail) {
      try {
        const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          userEmail = profile.emailAddress || "";
          localStorage.setItem("gmail_email", userEmail);
        }
      } catch {}
    }

    if (!userEmail) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-unanswered", {
        body: { accessToken, userEmail },
      });
      if (error) throw error;
      const unanswered = data?.unanswered || [];
      setEmails(unanswered);
      if (unanswered.length > 0) setExpanded(true);
    } catch (err) {
      console.error("Error fetching unanswered:", err);
    }
    setLoading(false);
  };

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem("dismissed_unanswered", JSON.stringify([...next]));
  };

  const visibleEmails = emails.filter(e => !dismissed.has(e.id));

  if (!hasToken) return null;
  if (visibleEmails.length === 0 && !loading) return null;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
      if (diffH < 1) return "Hace menos de 1h";
      if (diffH < 24) return `Hace ${diffH}h`;
      return `Hace ${Math.floor(diffH / 24)}d`;
    } catch { return dateStr; }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <MailWarning className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-sm">
              {loading ? "Revisando emails..." : `${visibleEmails.length} email${visibleEmails.length !== 1 ? "s" : ""} sin responder`}
            </p>
            <p className="text-xs text-muted-foreground">Últimas 48 horas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); fetchUnanswered(); }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && !loading && (
        <div className="px-4 pb-4 space-y-2">
          {visibleEmails.slice(0, 10).map((email) => (
            <div key={email.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{email.from}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(email.date)}</span>
                </div>
                <p className="text-xs font-medium text-foreground/80 truncate mt-0.5">{email.subject}</p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{email.snippet}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onSchedule && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Agendar seguimiento"
                    onClick={() => onSchedule(email.fromEmail, `Re: ${email.subject}`)}>
                    <CalendarDays className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Descartar" onClick={() => dismiss(email.id)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
          {visibleEmails.length > 10 && (
            <p className="text-xs text-center text-muted-foreground">+{visibleEmails.length - 10} más</p>
          )}
        </div>
      )}
    </div>
  );
}
