"use strict";

const { execFile } = require("node:child_process");

// Windows Core Audio is accessed through a fixed PowerShell + COM program.
// The only variable argument is a validated 0–100 integer passed separately
// to execFile; no user text is interpolated into a command string.
const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace JarvisAudio {
  public enum EDataFlow { eRender, eCapture, eAll }
  public enum ERole { eConsole, eMultimedia, eCommunications }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(EDataFlow flow, int mask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow flow, ERole role, out IMMDevice endpoint);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice endpoint);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
    [PreserveSig] int GetId(out IntPtr id);
    [PreserveSig] int GetState(out int state);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float level);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
  }
  public static class Endpoint {
    public static IAudioEndpointVolume Get() {
      var type = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
      var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(type);
      IMMDevice device;
      int hr = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device);
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
      object instance;
      hr = device.Activate(ref iid, 23, IntPtr.Zero, out instance);
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      return (IAudioEndpointVolume)instance;
    }
  }
}
'@
$percent = [int]$args[0]
$endpoint = [JarvisAudio.Endpoint]::Get()
$context = [guid]::Empty
$hr = $endpoint.SetMasterVolumeLevelScalar([single]($percent / 100.0), [ref]$context)
if ($hr -ne 0) { [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($hr) }
$actual = [single]0
$hr = $endpoint.GetMasterVolumeLevelScalar([ref]$actual)
if ($hr -ne 0) { [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($hr) }
[Console]::Out.WriteLine([int][math]::Round($actual * 100))
`;

class WindowsVolumeController {
    constructor(options = {}) {
        this.platform = options.platform || process.platform;
        this.execFile = options.execFile || execFile;
        this.timeout = Number.isFinite(options.timeout) ? options.timeout : 8000;
    }

    async setVolume(percent) {
        const value = typeof percent === "number" ? percent : Number(percent);
        if (!Number.isInteger(value) || value < 0 || value > 100) {
            return { success: false, action: "setVolume", error: "Volume must be a whole number from 0 to 100." };
        }
        if (this.platform !== "win32") {
            return { success: false, action: "setVolume", error: "System volume control is available only on Windows." };
        }

        return new Promise((resolve) => {
            this.execFile("powershell.exe", [
                "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCRIPT, String(value)
            ], { windowsHide: true, timeout: this.timeout }, (error, stdout) => {
                if (error) {
                    resolve({ success: false, action: "setVolume", error: error.message || "Windows volume control failed." });
                    return;
                }
                const actual = Number(String(stdout || "").trim());
                if (!Number.isInteger(actual) || actual < 0 || actual > 100) {
                    resolve({ success: false, action: "setVolume", error: "Windows did not return a verifiable volume level." });
                    return;
                }
                resolve({
                    success: actual === value,
                    action: "setVolume",
                    volume: actual,
                    message: actual === value ? `System volume set to ${actual}%.` : null,
                    error: actual === value ? null : `Requested ${value}% volume, but Windows reports ${actual}%.`
                });
            });
        });
    }
}

module.exports = { WindowsVolumeController, POWERSHELL_SCRIPT };
