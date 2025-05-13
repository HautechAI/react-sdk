export const useNaomi = () => {
    const generateNaomi = async (params: { advancedPrompt?: string; seed?: number }) => {
        const size = sizeForRatio(aspectRatio!);

        const pipeline = sdk.pipelines.constructTemplate((p) => {
            let finalPrompt = params.advancedPrompt;
            if (!params.advancedPrompt) {
                const gpt = p.defer.operations.run.gpt.v1({ input: { prompt: preparePromptNaomi() } });
                const awaitedGpt = p.defer.operations.wait({ id: gpt.result.id });
                finalPrompt = (awaitedGpt.result.output as { data: Record<string, string> }).data.prompt;
            }

            const seed = params.seed ?? Math.floor(Math.random() * 1000000);

            const naomi = p.defer.operations.run.haute.naomi.v1({
                input: {
                    prompt: finalPrompt!,
                    category: apparelCategory!,
                    garmentImageId: apparelData.items[0].processedImageId!,
                    poseId: currentPose!.id,
                    seed,
                    width: size.width,
                    height: size.height,
                    mode: apparelData.items[0].hasHuman ? 'model_to_model' : 'apparel_to_model',
                    loraIds: ['toddler', 'pre-teen'].includes(age)
                        ? ['37efeb34-6aa8-4f1c-a587-bc7b0fc324bd']
                        : undefined,
                },
            });

            const awaitedNaomi = p.defer.operations.wait({ id: naomi.result.id });

            const generatedImageId: string = (awaitedNaomi.result.output as Record<string, string>).imageId;

            const objectDetection = p.defer.operations.run.objectDetection.v1({
                input: {
                    imageId: generatedImageId,
                    labels: [`the ${apparelCategory!} cloth`],
                },
            });

            const awaitedObjectDetection = p.defer.operations.wait({ id: objectDetection.result.id });

            const segmentAnything = p.defer.operations.run.segmentAnything.mask.v1({
                input: {
                    imageId: generatedImageId,
                    box: (awaitedObjectDetection.result.output as { data: number[][] }).data[0],
                },
            });

            const awaitedSam = p.defer.operations.wait({ id: segmentAnything.result.id });

            const maskId = (awaitedSam.result.output as { imageId: string }).imageId;

            const negateImage = p.defer.operations.run.negateImage.v1({
                input: {
                    imageId: maskId,
                },
            });

            const awaitedNegateImage = p.defer.operations.wait({ id: negateImage.result.id });

            const maskIdNegative = (awaitedNegateImage.result.output as { imageId: string }).imageId;

            const inpaint = p.defer.operations.run.inpaint.kate.v1({
                input: {
                    imageId: generatedImageId,
                    maskImageId: maskIdNegative,
                    prompt: 'Ultra-realistic, high-resolution photograph of a model, sharp focus, professional DSLR quality, cinematic colors, depth of field, no blur, 4K, 8K, hyper-realistic, natural skin texture, photorealistic details, well-lit, fashion editorial style.',
                    seed,
                    strength: 0.3,
                    maskSpread: 25,
                    width: size.width,
                    height: size.height,
                },
            });
            const awaitedInpaint = p.defer.operations.wait({ id: inpaint.result.id });

            const contrastImage = p.defer.operations.run.contrast.v1({
                input: {
                    imageId: (awaitedInpaint.result.output as { imageId: string }).imageId,
                    contrast: -0.15,
                },
            });
            const awaitedContrastImage = p.defer.operations.wait({ id: contrastImage.result.id });

            const noisedImage = p.defer.operations.run.noise.v1({
                input: {
                    imageId: (awaitedContrastImage.result.output as { imageId: string }).imageId,
                    sigma: 3,
                },
            });
            const awaitedNoisedImage = p.defer.operations.wait({ id: noisedImage.result.id });

            const resultImageId = (awaitedNoisedImage.result.output as { imageId: string }).imageId;

            const stack = p.defer.stacks.create({
                metadata: {
                    strict: {
                        v: 1,
                        chips: {
                            apparelImage: omit(apparelData.items?.[0], 'id'),
                            model: model ? { age, gender, model } : undefined,
                            background: background ? background : undefined,
                            pose: {
                                id: currentPose?.id,
                                imageId: currentPose?.previewImageId,
                            },
                            prompt: prompt ? prompt : undefined,
                        },
                        prompt: finalPrompt,
                        size: {
                            width: size.width,
                            height: size.height,
                            aspectRatio: aspectRatio!.split(':').map(Number),
                        },
                        seed,
                        aiModel: AIModel.NAOMI,
                    } as StackMetadata,
                },
            });

            p.defer.access.attach({
                resourceId: resultImageId,
                parentResourceId: stack.result.id,
            });
            p.defer.access.attach({
                resourceId: apparelData.items[0].imageId!,
                parentResourceId: stack.result.id,
            });
            p.defer.access.attach({
                resourceId: apparelData.items[0].processedImageId!,
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

            return p;
        });

        const title = 'Naomi';
        const chips = params.advancedPrompt
            ? {
                  apparelImage: omit(apparelData.items?.[0], 'id'),
                  pose: {
                      id: currentPose!.id!,
                      imageId: currentPose!.previewImageId!,
                  },
                  prompt: params.advancedPrompt,
              }
            : {
                  apparelImage: omit(apparelData.items?.[0], 'id'),
                  model: model ? { age, gender, model } : undefined,
                  background: background ? background : undefined,
                  pose: {
                      id: currentPose!.id!,
                      imageId: currentPose!.previewImageId!,
                  },
                  prompt: prompt ? prompt : undefined,
              };
        const advanced = !!params.advancedPrompt;

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
