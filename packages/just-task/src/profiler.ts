import path from 'path';
import { outputJsonSync, readFileSync, existsSync  } from 'fs-extra';

/**
 * Information to store for each profile entry
 */
interface ProfileEntry {
  // Fields for google profiler entries
  name: string;
  ph: "X";
  ts: number;
  pid: number;
  tid: number;
  dur?: number;

  // Additional useful information
  id: number;
  cwd: string;
  packageName: string | undefined;
  state: "running" | "succeeded" | "failed";
  startTime: [number, number];
}

/**
 * Helper function to convert nodejs high resolution time into microSeconds.\
 * See: https://nodejs.org/api/process.html#process_process_hrtime_time
 **/
function hrtimeToMicroSeconds(hrtime: [number, number]): number {
  return (hrtime[0] * 1e9 + hrtime[1]) / 1000;
};

/**
 * Class to keep track of profiling data.
 * It will write out the profile in the chrome profiler format: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
 */
export class Profiler {
  startTime: Date;
  outputFolder: string;
  endTime: Date | undefined;
  entries: ProfileEntry[];

  /**
   * Constructs a new Profiler
   *
   * @param outputFolder Optional folder where to store the profile file
   */
  constructor(outputFolder: string | undefined) {
    this.outputFolder = outputFolder || process.cwd();
    this.startTime = new Date();
    this.entries = [];
  }

  /**
   * Starts a task.
   * It is invalid to start a task with the same id twice
   *
   * @param id Unique id of the task started
   * @param name Name of the task to display in the profile
   */
  start(id: number, name: string) {

    if (this.entries[id]) {
      throw new Error("Error: Usage of '--profile' encountered an unexpected state.");
    }

    const startTime = process.hrtime();
    const cwd = process.cwd();
    let packageName : string | undefined = undefined;

    const packageJsonPath = path.join(cwd, 'package.json');
    if (existsSync(packageJsonPath))
    {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      packageName = packageJson.name;
    }

    this.entries[id] = {
      name: name,
      ph: "X",
      ts: hrtimeToMicroSeconds(startTime),
      pid: process.pid,
      tid: id,

      // Extra fields
      cwd: process.cwd(),
      packageName: packageName,
      id: id,
      state: "running",
      startTime: startTime
    }
  }

  /**
   * Logs completion of a task
   * The task with the given id must have been started alread.
   *
   * @param id Unique id of the task. This must match the started task.
   * @param success Wheterh to record pass/fail
   */
  stop(id: number, success: boolean) {
    const entry = this.entries[id];
    if (!entry) {
      throw new Error("Error: Usage of '--profile' encountered an unexpected state.");
    }
    entry.state = success ? "succeeded" : "failed";
    entry.dur = hrtimeToMicroSeconds(process.hrtime(entry.startTime))
  }

  write() {
    // Write out the collected profile;
    this.endTime = new Date();
    const fileName = `just-tasks-Profile-${this.endTime.toJSON().replace(/-|:|/g, '')}.json`;

    outputJsonSync(
      path.join(this.outputFolder, fileName),
      // Emits TraceData for chromium based browsers: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
      {
        traceEvents: this.entries,
        displayTimeUnit: "ms",
        otherData: {
          source: "just-tasks profiler",
          startTime: this.startTime.toJSON(),
          endTime: this.endTime.toJSON(),
        },
      })
  }
}