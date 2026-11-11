import { getDifficulty } from "./difficulty.js";

const loading = document.getElementById("loading")!;
try {
    // Recipe data and the icon atlas depend on the selected mode (icon indices differ per export)
    const difficulty = getDifficulty();
    const atlasPath = difficulty === "hard" ? "data/atlas-hard.webp" : "data/atlas.webp";
    if (difficulty === "hard") {
        // The stylesheet resolves relative to assets/styles/, so use an absolute URL
        document.documentElement.style.setProperty("--atlas-url", `url('${new URL("./" + atlasPath, document.baseURI).href}')`);
    }
    const atlas = new Image();
    atlas.src = "./" + atlasPath;

    const dataUrl = difficulty === "hard"
        ? import.meta.resolve("./data/data-hard.bin")
        : import.meta.resolve("./data/data.bin");

    // Load repository and data in parallel
    const [repositoryModule, response] = await Promise.all([
        import("./repository.js"),
        fetch(dataUrl)
    ]);
    if (!response.ok)
        throw new Error(`Failed to load ${difficulty} mode recipe data (${response.status} ${response.statusText})`);
    const stream = response.body!.pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    repositoryModule.Repository.load(buffer);
    console.log("Repository loaded", repositoryModule.Repository.current);

    // Then load other modules
    await Promise.all([
        import("./touch.js"),
        import("./touchDrag.js"),
        import("./itemIcon.js"),
        import("./tooltip.js"),
        import("./nei.js"),
        import("./menu.js"),
        import("./recipeList.js")
    ]);
    let page = await import("./page.js");
    page.UpdateProject();
    loading.remove();
} catch (error:any) {
    loading.innerHTML = "An error occurred on loading:<br>" + error.message;
    console.error(error);
}

export {};