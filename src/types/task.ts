export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type TaskHint =
  | { type: "text"; value: string }
  | { type: "image"; value: string };

export type TaskDefinition = {
  app: string;
  payload: JsonValue;
  title: string;
  hint: TaskHint;
};
