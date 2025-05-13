export const useLinda = () => {
    const handleGenerateLinda = async () => {
        if (!apparelData.items?.[0]?.imageId) {
            throw new Error('No processed apparel image');
        }

        const pipeline = sdk.pipelines.constructTemplate((p) => {
            const seed = Math.floor(Math.random() * 1000000);
            const garmentImageId = apparelData.items[0].imageId!;

            let finalPrompt: string;
            if (model || background || prompt) {
                finalPrompt = preparePromptLinda();
            } else {
                const gpt = p.defer.operations.run.gpt.v1({
                    input: {
                        prompt: `Propose prompt to generate attractive photo of the item on model for e-commerce product card. 
- Keep only valuable information without redundant articles and words. 
- Add some details describing the model (face, hair, skin, pose)
- List other clothes on model
- Include key words: ultra realistic, high resolution. 
- Include type of the photo most suitable for item type: full-body, half-body, close-up
- Specify background. It can be studio or description of lifestyle scene

Return it in JSON format like { prompt }`,
                        imageId: garmentImageId,
                    },
                });
                const awaitedGpt = p.defer.operations.wait({ id: gpt.result.id });
                finalPrompt = (awaitedGpt.result.output as { data: Record<string, string> }).data.prompt;
            }

            const linda = p.defer.operations.run.haute.linda.v1({
                input: {
                    prompt: finalPrompt,
                    productImageId: garmentImageId,
                    seed: seed,
                    aspectRatio: aspectRatio as LindaHauteV1InputAspectRatioEnum,
                },
            });

            const awaitedLinda = p.defer.operations.wait({ id: linda.result.id });
            const generatedImageIds: string[] = (awaitedLinda.result.output as OperationOutputImageMultiple).imageIds;

            const size = sizeForRatio(aspectRatio!);
            for (let i = 0; i < 2; i++) {
                const generatedImageId = generatedImageIds[i];
                const inpaint = p.defer.operations.run.inpaint.kate.v1({
                    input: {
                        imageId: generatedImageId,
                        prompt: 'Ultra-realistic, high-resolution photograph of a model, sharp focus, professional DSLR quality, cinematic colors, depth of field, no blur, 4K, 8K, hyper-realistic, natural skin texture, photorealistic details, well-lit, fashion editorial style.',
                        seed,
                        strength: 0.25,
                        width: size.width,
                        height: size.height,
                    },
                });
                const awaitedInpaint = p.defer.operations.wait({ id: inpaint.result.id });
                const resultImageId = (awaitedInpaint.result.output as { imageId: string }).imageId;

                const stack = p.defer.stacks.create({
                    metadata: {
                        strict: {
                            v: 1,
                            chips: {
                                apparelImage: omit(apparelData.items?.[0], 'id'),
                                model: model ? { age, gender, model } : undefined,
                                background: background ? background : undefined,
                                prompt: prompt ? prompt : undefined,
                            },
                            prompt: finalPrompt,
                            size: { width: size.width, height: size.height, aspectRatio: aspectRatio!.split(':') },
                            seed,
                            aiModel: AIModel.LINDA,
                        } as StackMetadata,
                    },
                });

                p.defer.access.attach({
                    resourceId: resultImageId,
                    parentResourceId: stack.result.id,
                });
                p.defer.access.attach({
                    resourceId: garmentImageId,
                    parentResourceId: stack.result.id,
                });

                const addImageToStack = p.defer.stacks.items.add({
                    stackId: stack.result.id,
                    itemIds: [resultImageId],
                });

                p.after(addImageToStack.id).collections.items.add({
                    collectionId: props.personalCollectionId,
                    itemIds: [stack.result.id],
                });
            }

            return p;
        });

        const title = 'Linda';
        const chips = {
            apparelImage: omit(apparelData.items?.[0], 'id'),
            model: model ? { age, gender, model } : undefined,
            background: background ? background : undefined,
            prompt: prompt ? prompt : undefined,
        };

        const advanced = false;

        const metadata = {
            strict: {
                v: 1,
                title,
                chips,
                advanced,
            },
        } as const;

        await sdk.pipelines.create({ template: pipeline, metadata });
    };
};
