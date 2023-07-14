import { ActionLogger } from "../src/github/types";

export class TestLogger implements ActionLogger {
  logHistory: string[] = [];

  debug(message: string): void {
    this.logHistory.push(message);
  }
  info(message: string): void {
    this.logHistory.push(message);
  }
  warn(arg: string | Error): void {
    this.logHistory.push(typeof arg === "string" ? arg : arg.message);
  }
  error(arg: string | Error): void {
    this.logHistory.push(typeof arg === "string" ? arg : arg.message);
  }
}
