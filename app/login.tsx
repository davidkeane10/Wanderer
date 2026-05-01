import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/context/AuthContext";

type Mode = "login" | "register" | "forgot";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setName("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  function switchMode(next: Mode) {
    resetFields();
    setMode(next);
  }

  async function handleSubmit() {
    if (loading) return;

    if (mode === "forgot") {
      if (!email.trim()) {
        Alert.alert("Enter your email", "We need your email address to send a reset link.");
        return;
      }
      setLoading(true);
      try {
        await resetPassword(email);
        Alert.alert(
          "Check your inbox",
          `A password reset link has been sent to ${email.trim()}.`,
          [{ text: "Back to login", onPress: () => switchMode("login") }]
        );
      } catch (err) {
        Alert.alert("Error", friendlyError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "register") {
      if (name.trim().length < 2) {
        Alert.alert("Name required", "Please enter your first name (at least 2 characters).");
        return;
      }
      if (!email.trim()) {
        Alert.alert("Email required", "Please enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        Alert.alert("Weak password", "Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Passwords don't match", "Please make sure both passwords are identical.");
        return;
      }
      setLoading(true);
      try {
        await signUp(name, email, password);
        router.replace("/(tabs)/discover" as any);
      } catch (err) {
        Alert.alert("Sign up failed", friendlyError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/(tabs)/discover" as any);
    } catch (err) {
      Alert.alert("Login failed", friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Welcome back",
    register: "Create account",
    forgot: "Reset password",
  };

  const subtitles: Record<Mode, string> = {
    login: "Sign in to continue your adventures",
    register: "Join SideQuests and start exploring",
    forgot: "We'll email you a link to reset your password",
  };

  const submitLabels: Record<Mode, string> = {
    login: "Sign In",
    register: "Create Account",
    forgot: "Send Reset Link",
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / branding */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Ionicons name="compass" size={36} color="#6366f1" />
          </View>
          <Text style={styles.appName}>SideQuests</Text>
          <Text style={styles.tagline}>Discover places worth exploring</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>{titles[mode]}</Text>
          <Text style={styles.subtitle}>{subtitles[mode]}</Text>

          {/* Name field — register only */}
          {mode === "register" && (
            <View style={styles.field}>
              <Text style={styles.label}>Your Name</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color="#475569" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor="#475569"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  maxLength={40}
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color="#475569" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType={mode === "forgot" ? "done" : "next"}
                onSubmitEditing={mode === "forgot" ? handleSubmit : undefined}
              />
            </View>
          </View>

          {/* Password */}
          {mode !== "forgot" && (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color="#475569" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  returnKeyType={mode === "login" ? "done" : "next"}
                  onSubmitEditing={mode === "login" ? handleSubmit : undefined}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Confirm password — register only */}
          {mode === "register" && (
            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color="#475569" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Repeat password"
                  placeholderTextColor="#475569"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>
          )}

          {/* Forgot password link */}
          {mode === "login" && (
            <TouchableOpacity style={styles.forgotLink} onPress={() => switchMode("forgot")}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>{submitLabels[mode]}</Text>
            )}
          </TouchableOpacity>

          {/* Mode switcher */}
          <View style={styles.switchRow}>
            {mode === "login" && (
              <>
                <Text style={styles.switchText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => switchMode("register")}>
                  <Text style={styles.switchLink}>Sign up</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === "register" && (
              <>
                <Text style={styles.switchText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => switchMode("login")}>
                  <Text style={styles.switchLink}>Sign in</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === "forgot" && (
              <TouchableOpacity onPress={() => switchMode("login")} style={styles.backRow}>
                <Ionicons name="arrow-back" size={14} color="#6366f1" />
                <Text style={styles.switchLink}> Back to login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as any)?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again or reset it.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with that email already exists.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many failed attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "No internet connection. Check your network and try again.",
  };
  return map[code] ?? (err instanceof Error ? err.message : "Something went wrong. Please try again.");
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },

  brand: {
    alignItems: "center",
    marginBottom: 36,
    gap: 8,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: {
    fontSize: 30,
    fontWeight: "900",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "500",
  },

  card: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 4,
  },

  field: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#334155",
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#f1f5f9",
    height: "100%",
  },
  eyeBtn: { padding: 4 },

  forgotLink: { alignSelf: "flex-end", marginTop: -6 },
  forgotText: { fontSize: 13, color: "#6366f1", fontWeight: "600" },

  submitBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  switchText: { fontSize: 13, color: "#475569" },
  switchLink: { fontSize: 13, color: "#6366f1", fontWeight: "700" },
});
