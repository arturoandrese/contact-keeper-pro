import { describe, it, expect } from "vitest";
import { isAgentBaseName, agentBaseDate } from "@/lib/agentBases";

describe("agent bases", () => {
  it("recognizes the AGENTE 007 daily batch base", () => {
    expect(isAgentBaseName("AGENTE 007 - 2026-11-26")).toBe(true);
    expect(agentBaseDate("AGENTE 007 - 2026-11-26")).toBe("2026-11-26");
  });
  it("keeps manual bases out of Agentes", () => {
    expect(isAgentBaseName("15-10-26_11-35_ABINBEV")).toBe(false);
    expect(isAgentBaseName("20-10-26_16-58_b2b")).toBe(false);
    expect(agentBaseDate("07-10-26_15-56_BANCOS")).toBeNull();
  });
});
