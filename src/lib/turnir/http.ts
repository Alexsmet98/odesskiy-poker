import { TurnirError } from "./store";

export function turnirErrorResponse(error: unknown): Response {
  if (error instanceof TurnirError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "Не получилось прочитать запрос" },
      { status: 400 },
    );
  }
  console.error(error);
  return Response.json(
    { error: "Что-то пошло не так на сервере" },
    { status: 500 },
  );
}
