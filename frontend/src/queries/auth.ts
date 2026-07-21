import { queryOptions } from "@tanstack/react-query";
import { auth } from "@/api";

export const meOptions = queryOptions({
  queryKey: ["me"],
  queryFn: auth.me,
});
