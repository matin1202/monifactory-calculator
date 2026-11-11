import { getDifficulty } from "./difficulty.js";

const loading = document.getElementById("loading")!;
try {
    // Load the atlas image (shared by both modes)
    const atlas = new Image();
    atlas.src = "./data/atlas.webp";

    // Recipe data depends on the selected mode
    const difficulty = getDifficulty();
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