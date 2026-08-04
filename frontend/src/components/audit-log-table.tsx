import { useI18n } from "@/lib/i18n/context";
import type { AuditLogAction, AuditLogEntry } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = AuditLogEntry & { organization_name?: string | null };

function actionLabel(dict: Record<string, unknown>, action: AuditLogAction): string {
  const history = dict.history as Record<string, string>;
  return history[`action_${action}`] ?? action;
}

/** Tabla compartida por /audits/[id]/history y /admin/audit-logs. */
export function AuditLogTable({ logs, showOrg = false }: { logs: Row[]; showOrg?: boolean }) {
  const { dict } = useI18n();
  const t = showOrg ? dict.admin.auditLogs : dict.history;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.colDate}</TableHead>
            {showOrg && <TableHead>{dict.admin.auditLogs.colOrg}</TableHead>}
            <TableHead>{showOrg ? dict.admin.auditLogs.colAction : dict.history.colAction}</TableHead>
            <TableHead>{showOrg ? dict.admin.auditLogs.colActor : dict.history.colActor}</TableHead>
            <TableHead>{showOrg ? dict.admin.auditLogs.colIp : dict.history.colIp}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </TableCell>
              {showOrg && <TableCell className="text-sm">{log.organization_name ?? "—"}</TableCell>}
              <TableCell className="text-sm font-medium">{actionLabel(dict, log.action)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{log.actor_name ?? t.system}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{log.ip_address ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
