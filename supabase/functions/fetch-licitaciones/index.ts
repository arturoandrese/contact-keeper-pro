import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KEYWORDS = [
  "audiovisual",
  "producción audiovisual",
  "video corporativo",
  "videografía",
  "fotografía",
  "contenido audiovisual",
  "spot publicitario",
  "streaming",
  "transmisión en vivo",
  "registro audiovisual",
  "producción de contenido",
  "edición de video",
  "cápsula audiovisual",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TICKET = Deno.env.get("MERCADO_PUBLICO_TICKET");
    if (!TICKET) {
      return new Response(
        JSON.stringify({ error: "MERCADO_PUBLICO_TICKET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?estado=activas&ticket=${TICKET}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const text = await response.text();
      console.error("MercadoPublico API error:", response.status, text);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const listado = data?.Listado || [];

    const matched: Array<{
      codigo: string;
      nombre: string;
      organismo: string;
      fecha_cierre: string;
      fecha_publicacion: string;
      monto: string;
      url: string;
      keyword: string;
    }> = [];

    for (const lic of listado) {
      const nombre = (lic.Nombre || "").toLowerCase();
      const descripcion = (lic.Descripcion || "").toLowerCase();
      const searchText = `${nombre} ${descripcion}`;

      for (const kw of KEYWORDS) {
        if (searchText.includes(kw.toLowerCase())) {
          matched.push({
            codigo: lic.CodigoExterno || "",
            nombre: lic.Nombre || "",
            organismo: lic.Comprador?.NombreOrganismo || lic.NombreOrganismo || "",
            fecha_cierre: lic.FechaCierre || "",
            fecha_publicacion: lic.FechaCreacion || "",
            monto: lic.MontoEstimado?.toString() || "No especificado",
            url: `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=/${lic.CodigoExterno || ""}`,
            keyword: kw,
          });
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({ total: listado.length, matched: matched.length, licitaciones: matched }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in fetch-licitaciones:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
