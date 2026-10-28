import "@testing-library/dom";
import { overwriteGetLocale } from "@/paraglide/runtime";

// The tests check German texts and formats; jsdom's browser language is English.
overwriteGetLocale(() => "de");
