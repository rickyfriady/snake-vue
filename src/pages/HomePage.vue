<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-6">
    <section
      class="mt-12 rounded border border-slate-300 bg-white p-6 text-center shadow-sm"
    >
      <h1 class="text-2xl font-semibold text-slate-900">Snake Vue</h1>
      <p class="mt-3 text-sm text-slate-600">
        Classic Snake game with deterministic engine, Pinia state, and canvas
        renderer.
      </p>
      <RouterLink
        class="mt-5 inline-flex rounded border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white no-underline"
        to="/snake"
      >
        Play Snake
      </RouterLink>
    </section>
  </main>
</template>
