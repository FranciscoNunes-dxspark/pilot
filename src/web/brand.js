// Pilot's window on Windows' taskbar. The window is Edge's (or Chrome's) app window, so on its own it
// groups with the browser and its taskbar button shows the page's 16 px icon made bigger, which looks
// blurred. While the server runs, a small PowerShell helper finds Pilot's windows (a Chromium window
// titled "Pilot" or "… - Pilot", which only an app window is: a browser window adds the browser's name)
// and makes them Pilot's: its own AppUserModelID, the one the setup's Start menu shortcut carries, so
// Windows draws the button from pilot.ico at the size it needs and groups Pilot's windows together;
// relaunch properties, so pinning it to the taskbar pins `pilot app`, not the browser; and the window's
// own icons from pilot.ico, for a Pilot installed without the setup. It checks every second, as the
// browser sets its icon again when a page reloads, and stops once the server has.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

/** The ID Windows groups Pilot's windows and its Start menu shortcut by (installer/Pilot.iss has it too). */
export const APP_ID = 'DXSpark.Pilot';

/** The icon beside the executable (the setup puts pilot.ico there), else the executable's own. */
export function iconFile(exe = process.execPath, exists = existsSync) {
  const path = exe.includes('\\') ? win32 : posix;
  const ico = path.join(path.dirname(exe), 'pilot.ico');
  return exists(ico) ? ico : exe;
}

const BRAND = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PilotPropertyKey {
  public Guid fmtid;
  public uint pid;
  public PilotPropertyKey(Guid g, uint p) { fmtid = g; pid = p; }
}
[StructLayout(LayoutKind.Explicit)]
public struct PilotPropVariant {
  [FieldOffset(0)] public ushort vt;
  [FieldOffset(8)] public IntPtr p;
  [FieldOffset(16)] public IntPtr p2;
}
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPilotPropertyStore {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index, out PilotPropertyKey key);
  [PreserveSig] int GetValue(ref PilotPropertyKey key, out PilotPropVariant value);
  [PreserveSig] int SetValue(ref PilotPropertyKey key, ref PilotPropVariant value);
  [PreserveSig] int Commit();
}
public static class PilotBrand {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr lparam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, uint[] ids, uint n, uint flags);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPilotPropertyStore store);

  static readonly Guid AUMID_KEYS = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
  static EnumProc keep;

  static void Set(IPilotPropertyStore store, uint pid, string value) {
    var key = new PilotPropertyKey(AUMID_KEYS, pid);
    var v = new PilotPropVariant();
    v.vt = 31; // VT_LPWSTR
    v.p = Marshal.StringToCoTaskMemUni(value);
    try { store.SetValue(ref key, ref v); } finally { Marshal.FreeCoTaskMem(v.p); }
  }

  static IntPtr Icon(string file, int size) {
    var icons = new IntPtr[1];
    var ids = new uint[1];
    return PrivateExtractIcons(file, 0, size, size, icons, ids, 1, 0) == 1 ? icons[0] : IntPtr.Zero;
  }

  static bool IsPilot(IntPtr hwnd) {
    if (!IsWindowVisible(hwnd)) return false;
    var cls = new StringBuilder(64);
    GetClassName(hwnd, cls, cls.Capacity);
    if (cls.ToString() != "Chrome_WidgetWin_1") return false;
    var title = new StringBuilder(512);
    GetWindowText(hwnd, title, title.Capacity);
    var t = title.ToString();
    return t == "Pilot" || t.EndsWith(" - Pilot");
  }

  static void Brand(IntPtr hwnd, string id, string command, string icon) {
    var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPilotPropertyStore store;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
    try {
      Set(store, 5, id);                 // System.AppUserModel.ID
      Set(store, 2, command);            // System.AppUserModel.RelaunchCommand
      Set(store, 3, icon + ",0");        // System.AppUserModel.RelaunchIconResource
      Set(store, 4, "Pilot");            // System.AppUserModel.RelaunchDisplayNameResource
      store.Commit();
    } finally {
      Marshal.ReleaseComObject(store);
    }
  }

  public static void Run(string id, string command, string icon, int server) {
    // Real pixels: the icon sizes the taskbar and the title bar use at this screen's scale.
    SetProcessDPIAware();
    IntPtr big = Icon(icon, GetSystemMetrics(11));   // SM_CXICON
    IntPtr small = Icon(icon, GetSystemMetrics(49)); // SM_CXSMICON
    var done = new HashSet<IntPtr>();
    keep = (hwnd, l) => {
      if (!IsPilot(hwnd)) return true;
      if (done.Add(hwnd)) Brand(hwnd, id, command, icon);
      // WM_GETICON / WM_SETICON: the browser puts its own back when the page reloads.
      if (big != IntPtr.Zero && SendMessage(hwnd, 0x7F, (IntPtr)1, IntPtr.Zero) != big) {
        SendMessage(hwnd, 0x80, (IntPtr)1, big);
        if (small != IntPtr.Zero) SendMessage(hwnd, 0x80, (IntPtr)0, small);
      }
      return true;
    };
    while (true) {
      try { if (Process.GetProcessById(server).HasExited) return; } catch { return; }
      EnumWindows(keep, IntPtr.Zero);
      Thread.Sleep(1000);
    }
  }
}
'@
if ($env:PILOT_BRAND_CHECK) { exit 0 }
[PilotBrand]::Run($env:PILOT_BRAND_ID, $env:PILOT_BRAND_COMMAND, $env:PILOT_BRAND_ICON, [int]$env:PILOT_BRAND_SERVER)
`;

/** The PowerShell command and environment that brand Pilot's windows while process `server` runs. */
export function brandCommand({ exe = process.execPath, server = process.pid, env = process.env, check = false } = {}) {
  return {
    cmd: 'powershell',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', BRAND],
    env: {
      ...env,
      PILOT_BRAND_ID: APP_ID,
      PILOT_BRAND_COMMAND: `"${exe}" app`,
      PILOT_BRAND_ICON: iconFile(exe),
      PILOT_BRAND_SERVER: String(server),
      ...(check ? { PILOT_BRAND_CHECK: '1' } : {}),
    },
  };
}

/** Starts the helper (Windows only); it ends by itself once the server has. Never throws. */
export function brandWindows({ log = () => {}, run = spawn, ...opts } = {}) {
  try {
    const { cmd, args, env } = brandCommand(opts);
    const child = run(cmd, args, { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr?.on('data', (d) => log(`Taskbar icon: ${String(d).trim().split('\n')[0]}`));
    child.on('error', (e) => log(`Taskbar icon: ${e.message}`));
    return child;
  } catch (e) {
    log(`Taskbar icon: ${e.message}`);
    return null;
  }
}
