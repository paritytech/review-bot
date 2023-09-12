import { TeamApi } from "../github/types";

export class PolkadotFellows implements TeamApi {
  private connected: boolean = false;
  getTeamMembers(teamName: string): Promise<string[]> {
    throw new Error("Method not implemented.");
  }

  disconnect(): void {
    if (this.connected) {
      console.log("Disconnecting");
    }

    this.connected = false;
  }
}
