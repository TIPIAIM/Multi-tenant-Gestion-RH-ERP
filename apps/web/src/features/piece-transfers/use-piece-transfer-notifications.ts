import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth.context";
import { getPieceTransferNotifications } from "./piece-transfer.api";

export function usePieceTransferNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["piece-transfers", "notifications", user?.id],
    queryFn: () => getPieceTransferNotifications({ page: 1, limit: 1 }),
    enabled: Boolean(user?.id),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchOnMount: "always",
  });
}
