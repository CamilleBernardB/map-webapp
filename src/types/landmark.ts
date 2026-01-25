import type { TaskDefinition } from "./task";

export type Landmark = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  task: TaskDefinition;
};
