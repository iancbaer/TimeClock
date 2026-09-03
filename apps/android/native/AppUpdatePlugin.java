package com.iancbaer.timeclock;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String PACKAGE_NAME = "com.iancbaer.timeclock";
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = currentPackage();
            JSObject result = new JSObject();
            result.put("packageName", info.packageName);
            result.put("versionCode", versionCode(info));
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            result.put("certificateSha256", certificateSha256(info));
            result.put("canInstallPackages", canInstallPackages());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read the installed TimeClock version.", "APP_INFO_FAILED", error);
        }
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = normalizeFingerprint(call.getString("sha256", ""));
        String expectedCertificate = normalizeFingerprint(call.getString("certificateSha256", ""));
        JSObject headers = call.getObject("headers", new JSObject());
        if (url == null || expectedSha256.length() != 64 || expectedCertificate.length() != 64) {
            call.reject("The update metadata is incomplete.", "INVALID_UPDATE");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("Allow TimeClock to install updates, then try again.", "INSTALL_PERMISSION_REQUIRED");
            return;
        }

        execute(() -> {
            File temporary = null;
            try {
                File directory = new File(getContext().getCacheDir(), "updates");
                if (!directory.exists() && !directory.mkdirs()) throw new Exception("Could not create update cache.");
                temporary = new File(directory, "timeclock-download.tmp");
                File apk = new File(directory, "timeclock-update.apk");
                download(url, headers, temporary);
                String actualHash = sha256(temporary);
                if (!actualHash.equals(expectedSha256)) throw new UpdateException("HASH_MISMATCH", "The downloaded update did not pass its integrity check.");

                PackageInfo archive = archivePackage(temporary);
                if (archive == null || !PACKAGE_NAME.equals(archive.packageName)) throw new UpdateException("PACKAGE_MISMATCH", "The download is not a TimeClock update.");
                if (versionCode(archive) <= versionCode(currentPackage())) throw new UpdateException("VERSION_NOT_NEWER", "The downloaded update is not newer than this installation.");
                String archiveCertificate = certificateSha256(archive);
                String installedCertificate = certificateSha256(currentPackage());
                if (!archiveCertificate.equals(expectedCertificate) || !archiveCertificate.equals(installedCertificate)) {
                    throw new UpdateException("SIGNATURE_MISMATCH", "The update was not signed by the installed TimeClock publisher.");
                }
                if (apk.exists() && !apk.delete()) throw new Exception("Could not replace cached update.");
                if (!temporary.renameTo(apk)) throw new Exception("Could not prepare the downloaded update.");
                temporary = null;

                Uri contentUri = FileProvider.getUriForFile(getContext(), PACKAGE_NAME + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(contentUri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                install.setClipData(ClipData.newRawUri("TimeClock update", contentUri));
                getBridge().executeOnMainThread(() -> {
                    try {
                        getContext().startActivity(install);
                        JSObject result = new JSObject();
                        result.put("started", true);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Android could not open the update installer.", "INSTALL_LAUNCH_FAILED", error);
                    }
                });
            } catch (UpdateException error) {
                call.reject(error.getMessage(), error.code, error);
            } catch (Exception error) {
                call.reject("The TimeClock update could not be downloaded or verified.", "DOWNLOAD_FAILED", error);
            } finally {
                if (temporary != null && temporary.exists()) temporary.delete();
            }
        });
    }

    private void download(String source, JSObject headers, File destination) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(120_000);
        connection.setInstanceFollowRedirects(false);
        Iterator<String> names = headers.keys();
        while (names.hasNext()) {
            String name = names.next();
            connection.setRequestProperty(name, headers.getString(name));
        }
        connection.connect();
        if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
            int status = connection.getResponseCode();
            connection.disconnect();
            throw new Exception("Update server returned HTTP " + status + ".");
        }
        long declaredLength = connection.getContentLengthLong();
        if (declaredLength > MAX_APK_BYTES) throw new Exception("Update is larger than allowed.");
        long received = 0;
        try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                received += count;
                if (received > MAX_APK_BYTES) throw new Exception("Update is larger than allowed.");
                output.write(buffer, 0, count);
            }
        } finally {
            connection.disconnect();
        }
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private PackageInfo currentPackage() throws Exception {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags);
    }

    private PackageInfo archivePackage(File file) {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), flags);
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Signature firstSignature(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null
            ? info.signingInfo.getApkContentsSigners()
            : info.signatures;
        if (signatures == null || signatures.length != 1) throw new Exception("Expected one APK signer.");
        return signatures[0];
    }

    private String certificateSha256(PackageInfo info) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(firstSignature(info).toByteArray()));
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(Locale.US, "%02X", value));
        return result.toString();
    }

    private String normalizeFingerprint(String value) {
        return value == null ? "" : value.replace(":", "").trim().toUpperCase(Locale.US);
    }

    private static class UpdateException extends Exception {
        final String code;
        UpdateException(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
