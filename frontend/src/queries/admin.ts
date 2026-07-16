import { queryOptions } from "@tanstack/react-query"
import { admin as adminApi } from "@/api"

export const adminUsersOptions = queryOptions({
  queryKey: ["admin-users"],
  queryFn: adminApi.users,
})

export const adminStatsOptions = queryOptions({
  queryKey: ["admin-stats"],
  queryFn: adminApi.stats,
})

export const adminExportsOptions = queryOptions({
  queryKey: ["admin-exports"],
  queryFn: () => adminApi.exports(50),
})
