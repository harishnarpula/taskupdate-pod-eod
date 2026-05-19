import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "https://meta.oxyloans.com/api";

interface LoginResponse {
    token: string;
    id: string;
    name: string;
}

async function login(): Promise<LoginResponse> {
    const response = await axios.post(
        `${BASE_URL}/user-service/userEmailPassword`,
        {
            email: process.env.PORTAL_EMAIL,
            password: process.env.PORTAL_PASSWORD,
        }
    );

    const { token, id, name, errorMessage } = response.data;

    if (errorMessage) {
        throw new Error(`Login failed: ${errorMessage}`);
    }

    console.log("✅ Login successful:", name);

    return { token, id, name };
}

async function getTodayTaskId(token: string, userId: string): Promise<string> {
    const response = await axios.post(
        `${BASE_URL}/user-service/write/getAllTaskUpdates`,
        {
            taskStatus: "PENDING",
            userId,
        },
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    const tasks = response.data;

    const today = new Date().toISOString().split("T")[0]; // "2025-05-18"

    const todayTask = Array.isArray(tasks)
        ? tasks.find((t: any) => t.planCreatedAt?.split(" ")[0] === today)
        : null;

    if (!todayTask?.id) {
        throw new Error("No pending task found for today. Please submit your POD first.");
    }

    return todayTask.id;
}

export async function submitPOD(text: string): Promise<void> {
    const { token, id, name } = await login();

    const response = await axios.patch(
        `${BASE_URL}/user-service/write/userTaskUpdate`,
        {
            planOftheDay: `${text} - Plan by ${name}`,
            taskAssinedBy: name,
            taskTeam: "TECHTEAM",
            userId: id,
        },
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    console.log("✅ POD submitted:", response.data);
}

export async function submitEOD(text: string): Promise<void> {
    const { token, id } = await login();

    const taskId = await getTodayTaskId(token, id);

    await axios.patch(
        `${BASE_URL}/user-service/write/userTaskUpdate`,
        {
            id: taskId,
            endOftheDay: text,
            taskStatus: "COMPLETED",
            userId: id,
            userDocumentId: null,
        },
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    console.log("✅ EOD submitted for task:", taskId);
}
