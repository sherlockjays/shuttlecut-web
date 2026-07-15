import { queryOptions } from "@tanstack/react-query"
import { exports as exportsApi } from "@/api"

export const exportsOptions = queryOptions({
  queryKey: ["exports"],
  queryFn: exportsApi.list,
})

export const exportStatusOptions = (exportId: number) =>
  queryOptions({
    queryKey: ["export-status", exportId],
    queryFn: () => exportsApi.status(exportId),
  })
