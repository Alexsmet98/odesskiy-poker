import { LobbyScreen } from "@/components/menu/lobby-screen";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <LobbyScreen code={code} />;
}
