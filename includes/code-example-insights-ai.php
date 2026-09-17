<?php
/** AI interpretation endpoint for concept-level Code Example analytics. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
add_action( 'rest_api_init', function () {
	register_rest_route( 'intelligent-code-assistant/v1', '/analyze-code-example-insights', array(
		'methods' => WP_REST_Server::CREATABLE,
		'callback' => function ( WP_REST_Request $request ) {
			$id=absint($request->get_param('codeExampleId'));$post=get_post($id);
			if(!$post||'ica_code_example'!==$post->post_type)return new WP_Error('invalid_code_example',__('A valid Code Example ID is required.','intelligent-code-assistant'),array('status'=>400));
			$summary=intelligent_code_assistant_get_code_example_analytics_summary($id);$title=get_the_title($id)?:sprintf(__('Code Example #%d','intelligent-code-assistant'),$id);
			$result=intelligent_code_assistant_execute_reader_insights_ability(array('articleTitle'=>sprintf(__('Code Example: %s (across all referencing articles)','intelligent-code-assistant'),$title),'summary'=>$summary));
			return is_wp_error($result)?$result:rest_ensure_response($result);
		},
		'permission_callback'=>function(WP_REST_Request $request){$id=absint($request->get_param('codeExampleId'));return $id>0&&current_user_can('edit_post',$id);},
		'args'=>array('codeExampleId'=>array('required'=>true,'type'=>'integer','minimum'=>1,'sanitize_callback'=>'absint')),
	) );
} );
